#!/usr/bin/env python3
"""Phase B review board — single-problem CLI.

Renders the six persona prompts against one v2 problem, calls the
claude CLI (model distribution per docs/phase-b-review-design.md §6),
runs the fix-loop (Round 1→2→3 with revert on regression), and
optionally writes the validation block + permanent report.

  python3 scripts/review-problem.py g7s1-ch4-01                   # dry-run, fix-loop simulated
  python3 scripts/review-problem.py g7s1-ch4-01 --apply           # write back to disk
  python3 scripts/review-problem.py g7s1-ch4-01 --no-fix-loop     # Round 1 only
  python3 scripts/review-problem.py g7s1-ch4-01 --personas math-correctness,solvability
  python3 scripts/review-problem.py g7s1-ch4-01 --raw     # dump raw + parsed JSON
  python3 scripts/review-problem.py g7s1-ch4-01 --serial  # legacy serial mode

For batch operation across grades / semesters, use review-batch.py.
"""

import argparse
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import review as R


def summarize(problem: dict, results: list[dict]) -> None:
    print()
    print(f"problem: {problem['id']}  topicId={problem['topicId']}  difficulty=L{problem['difficulty']}")
    print(f"question: {problem['content']['question'][:80]}…")
    print()

    print(f"{'persona':<24}{'verdict':<8}{'score':<7}{'findings':<10}{'flags'}")
    print("-" * 60)
    for r in results:
        if "error" in r:
            print(f"{r['persona']:<24}{'ERROR':<8}{'—':<7}{'—':<10}{r['error']}")
            continue
        flags = []
        if r.get("autoFix"):
            flags.append("autoFix")
        if r.get("askHuman"):
            flags.append("askHuman")
        if r.get("axisInferences"):
            flags.append("axes")
        print(f"{r['persona']:<24}{r['verdict']:<8}{r['score']:<7}{len(r['findings']):<10}{','.join(flags)}")

    gate = R.compute_gate(results)
    print("-" * 60)
    if gate["final_score"] is None:
        print(gate["reason"])
    else:
        print(f"final_score (min) = {gate['final_score']}  →  {gate['status']}   ({gate['reason']})")

    print()
    for r in results:
        if "findings" not in r:
            continue
        notable = [f for f in r["findings"] if f.get("severity") in ("warn", "critical")]
        if not notable:
            continue
        print(f"⚠ {r['persona']}:")
        for f in notable:
            sev = f.get("severity", "?")
            field = f.get("field", "?")
            msg = f.get("message", "")
            sug = f.get("suggestion")
            print(f"  [{sev}] {field}: {msg}" + (f"  → {sug}" if sug else ""))
        print()


def main() -> int:
    ap = argparse.ArgumentParser(description="Phase B review board — single problem")
    ap.add_argument("problem_id")
    ap.add_argument("--personas", default=",".join(R.PERSONAS.keys()),
                    help="comma-separated subset of personas (default: all 6)")
    ap.add_argument("--raw", action="store_true", help="dump raw + parsed JSON per persona")
    ap.add_argument("--serial", action="store_true", help="legacy serial mode (debugging)")
    ap.add_argument("--apply", action="store_true",
                    help="write validation block + patched problem + report to disk")
    ap.add_argument("--no-fix-loop", action="store_true", help="Round 1 only — no patching")
    ap.add_argument("--max-rounds", type=int, default=3, help="max fix-loop rounds (default 3)")
    args = ap.parse_args()

    selected = [p.strip() for p in args.personas.split(",") if p.strip()]
    unknown = [p for p in selected if p not in R.PERSONAS]
    if unknown:
        raise SystemExit(f"unknown personas: {unknown}  (valid: {list(R.PERSONAS)})")

    problem = R.load_problem(args.problem_id)
    if problem.get("schema") != "forming-problem/2.0":
        raise SystemExit(f"{args.problem_id} is not a v2 problem (schema={problem.get('schema')!r})")
    chapter = R.build_chapter_context(problem)
    shared = R.load_shared_prompt()

    wall_t0 = time.time()

    if args.serial:
        # Serial mode for debugging — keep the synchronous variant alive.
        results = [R.run_persona(name, problem, chapter, shared, args.raw) for name in selected]
        gate = R.compute_gate(results)
        history = [{"round": 1, "results": results, "gate": gate, "appliedPatches": [], "failedPatches": []}]
        rounds = 1
    elif args.no_fix_loop:
        results = asyncio.run(R.run_all_async(selected, problem, chapter, shared, args.raw))
        gate = R.compute_gate(results)
        history = [{"round": 1, "results": results, "gate": gate, "appliedPatches": [], "failedPatches": []}]
        rounds = 1
    else:
        problem, history, gate = asyncio.run(
            R.fix_loop(selected, problem, chapter, shared, args.raw, args.max_rounds)
        )
        results = history[-1]["results"]
        rounds = len(history)

    wall_elapsed = time.time() - wall_t0
    summarize(problem, results)
    print(f"\nwall time: {wall_elapsed:.1f}s  (mode: {'serial' if args.serial else 'parallel'}, rounds: {rounds})")

    # Axis inference merge over the final round.
    merged_axes, axis_log = R.merge_axis_inferences(results)
    if merged_axes:
        print("\naxis inference merge:")
        for name, payload in merged_axes.items():
            preview = payload["value"]
            if isinstance(preview, list):
                preview = ", ".join(preview[:5]) + (f"  (+{len(preview)-5} more)" if len(preview) > 5 else "")
            print(f"  {name}: {preview}  (conf={payload['confidence']})")

    if args.apply:
        if any("error" in r for r in results):
            print("\nrefusing to --apply: one or more personas errored. Investigate first.")
            return 1
        axis_record = R.apply_merged_axes(problem, merged_axes) if merged_axes else None
        axis_merge_payload = (
            {"merged": merged_axes, "byPersona": axis_log, "applied": axis_record}
            if (merged_axes or axis_log) else None
        )
        report = R.write_report(args.problem_id, history, gate, axis_merge=axis_merge_payload)
        report_ref = os.path.relpath(report, R.ROOT)
        R.update_validation_block(problem, gate, results, rounds, report_ref)
        path = R.save_problem(problem)
        print(f"\nwrote validation block → {os.path.relpath(path, R.ROOT)}")
        print(f"wrote round-by-round report → {report_ref}")
        if axis_record and axis_record["written"]:
            print(f"wrote axes → {', '.join(axis_record['written'])}")
        if axis_record and axis_record["preserved_human"]:
            print(f"preserved human axes → {', '.join(axis_record['preserved_human'])}")
    elif gate.get("status") and gate["status"] != "PASS":
        print("\n(dry-run — pass --apply to write validation block + report)")

    return 1 if any("error" in r for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
