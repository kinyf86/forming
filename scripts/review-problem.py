#!/usr/bin/env python3
"""Phase B review board — single-problem driver (B.1 → B.3).

Loads a curated v2 problem, renders the six persona prompts with the
problem + chapter context, calls the claude CLI for each (using the
model distribution from docs/phase-b-review-design.md §6), validates
the JSON output, optionally runs the fix-loop (Round 1 → 2 → 3 with
revert on regression), and writes the validation block + report.

  python3 scripts/review-problem.py g7s1-ch4-01                    # dry-run, fix-loop simulated
  python3 scripts/review-problem.py g7s1-ch4-01 --apply            # write back if PASS / patched / NEEDS_HUMAN
  python3 scripts/review-problem.py g7s1-ch4-01 --no-fix-loop      # Round 1 only
  python3 scripts/review-problem.py g7s1-ch4-01 --personas math-correctness,solvability
  python3 scripts/review-problem.py g7s1-ch4-01 --raw     # dump raw + parsed JSON
  python3 scripts/review-problem.py g7s1-ch4-01 --serial  # legacy serial mode

B.3 scope: patch-only fix-loop. If a persona returns askHuman *without*
an autoFix, the loop short-circuits to NEEDS_HUMAN (no regenerate yet —
that's B.3.5 / B.4).
"""

import argparse
import asyncio
import copy
import datetime as _dt
import json
import os
import re
import sys
import time
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import curriculum, llm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMPTS_DIR = os.path.join(ROOT, "src/data/prompts/review")
CURATED_DIR = os.path.join(ROOT, "src/data/problems/curated")
RUNTIME_DIR = os.path.join(ROOT, "src/data/generated")
REPORTS_DIR = os.path.join(ROOT, "src/data/validation-reports")

# §6 model distribution. backend names map to MODEL_MAP in lib/llm.py.
PERSONAS: dict[str, dict] = {
    "math-correctness":      {"file": "math-correctness.md",      "backend": "opus",   "timeout": 240},
    "trap-quality":          {"file": "trap-quality.md",          "backend": "opus",   "timeout": 240},
    "grade-appropriateness": {"file": "grade-appropriateness.md", "backend": "sonnet", "timeout": 180},
    "solvability":           {"file": "solvability.md",           "backend": "sonnet", "timeout": 180},
    "curriculum-alignment":  {"file": "curriculum-alignment.md",  "backend": "sonnet", "timeout": 180},
    "korean-naturalness":    {"file": "korean-naturalness.md",    "backend": "haiku",  "timeout": 120},
}

REQUIRED_OUTPUT_FIELDS = {"persona", "score", "verdict", "findings"}
VALID_VERDICTS = {"PASS", "WARN", "FAIL"}


def load_problem(problem_id: str) -> dict:
    """Find the curated v2 problem by id."""
    for d in (CURATED_DIR, RUNTIME_DIR):
        path = os.path.join(d, f"{problem_id}.json")
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
    raise SystemExit(f"problem not found: {problem_id} (checked curated + generated)")


def build_chapter_context(problem: dict) -> dict:
    curricula = curriculum.load_all_curricula()
    chapter, cur = curriculum.find_chapter(curricula, problem["topicId"])
    if chapter is None:
        raise SystemExit(f"chapter not found for topicId={problem['topicId']}")
    # locate semester title for nicer prompt
    semester_title = ""
    for sem in cur["semesters"]:
        if any(ch["id"] == chapter["id"] for ch in sem["chapters"]):
            semester_title = sem.get("title", "")
            break
    return {
        "grade": cur["grade"],
        "subject": cur["subject"],
        "semesterTitle": semester_title,
        "chapterTitle": chapter["title"],
        "concepts": chapter["concepts"],
    }


# ────────────────────────── prompt rendering ──────────────────────────

_IF_BLOCK = re.compile(r"\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{/if\}\}")
_VAR = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def _lookup(context: dict, path: str):
    cur = context
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _format(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def render_prompt(template: str, context: dict, shared: str) -> str:
    # 1. Drop conditional blocks whose key is falsy in context.
    def _if_repl(m: re.Match) -> str:
        key, body = m.group(1), m.group(2)
        return body if context.get(key) else ""
    rendered = _IF_BLOCK.sub(_if_repl, template)

    # 2. Substitute {{shared}} with the shared schema.
    rendered = rendered.replace("{{shared}}", shared)

    # 3. Substitute {{var}} and {{nested.path}}.
    def _var_repl(m: re.Match) -> str:
        return _format(_lookup(context, m.group(1)))
    return _VAR.sub(_var_repl, rendered)


def build_context(problem: dict, chapter: dict, attempt: int = 1) -> dict:
    return {
        "problem": problem,
        "problemJson": json.dumps(problem, ensure_ascii=False, indent=2),
        "chapter": dict(chapter, concepts=", ".join(chapter["concepts"])),
        "attempt": attempt,
        # B.1: previousFindings / prerequisites are never set yet.
        "previousFindings": None,
        "previousFindingsJson": "",
        "prerequisites": None,
    }


# ────────────────────────── persona invocation ──────────────────────────


def validate_output(raw: Optional[str], persona: str) -> tuple[Optional[dict], Optional[str]]:
    """Return (parsed, error). parsed=None means error str describes the issue."""
    if not raw:
        return None, "no response from CLI"
    parsed = llm.parse_json(raw)
    if parsed is None:
        return None, f"failed to parse JSON (raw head: {raw[:120]!r})"

    missing = REQUIRED_OUTPUT_FIELDS - set(parsed.keys())
    if missing:
        return None, f"missing required fields: {sorted(missing)}"
    if not isinstance(parsed["score"], int) or not 1 <= parsed["score"] <= 10:
        return None, f"score must be int 1-10, got {parsed['score']!r}"
    if parsed["verdict"] not in VALID_VERDICTS:
        return None, f"verdict must be PASS|WARN|FAIL, got {parsed['verdict']!r}"
    if not isinstance(parsed["findings"], list):
        return None, "findings must be array"
    if parsed["persona"] != persona:
        # Soft warning — overwrite and continue.
        parsed["persona"] = persona
    return parsed, None


def _format_result(name: str, parsed: Optional[dict], err: Optional[str], elapsed: float, raw: Optional[str], raw_dump: bool) -> dict:
    cfg = PERSONAS[name]
    label = f"[{name:<22} → {cfg['backend']:<6}]"
    if err:
        print(f"{label} FAIL ({elapsed:.1f}s) — {err}")
        if raw_dump and raw:
            print(f"--- raw output ({name}) ---\n{raw}\n--- end ---")
        return {"persona": name, "error": err, "elapsedSec": elapsed, "rawOutput": raw}

    verdict = parsed["verdict"]
    score = parsed["score"]
    n_find = len(parsed["findings"])
    auto = " +autoFix" if parsed.get("autoFix") else ""
    ask = " +askHuman" if parsed.get("askHuman") else ""
    print(f"{label} {verdict:<4} score={score}  findings={n_find}{auto}{ask}  ({elapsed:.1f}s)", flush=True)
    if raw_dump:
        print(f"--- parsed ({name}) ---\n{json.dumps(parsed, ensure_ascii=False, indent=2)}\n--- end ---")
    parsed["elapsedSec"] = elapsed
    return parsed


def _prepare_prompt(name: str, problem: dict, chapter: dict, shared: str) -> str:
    cfg = PERSONAS[name]
    template = open(os.path.join(PROMPTS_DIR, cfg["file"])).read()
    context = build_context(problem, chapter)
    return render_prompt(template, context, shared)


def run_persona(name: str, problem: dict, chapter: dict, shared: str, raw_dump: bool) -> dict:
    """Synchronous variant. Kept for --serial mode and easier debugging."""
    cfg = PERSONAS[name]
    prompt = _prepare_prompt(name, problem, chapter, shared)
    print(f"[{name:<22} → {cfg['backend']:<6}] calling…", flush=True)
    t0 = time.time()
    raw = llm.call_llm(
        prompt,
        backend=cfg["backend"],
        timeout=cfg["timeout"],
        retries=2,
        isolate_cwd=True,
        silent_retry=True,
    )
    elapsed = time.time() - t0
    parsed, err = validate_output(raw, name)
    return _format_result(name, parsed, err, elapsed, raw, raw_dump)


async def run_persona_async(name: str, problem: dict, chapter: dict, shared: str, raw_dump: bool) -> dict:
    cfg = PERSONAS[name]
    prompt = _prepare_prompt(name, problem, chapter, shared)
    t0 = time.time()
    raw = await llm.call_llm_async(
        prompt,
        backend=cfg["backend"],
        timeout=cfg["timeout"],
        retries=2,
        isolate_cwd=True,
    )
    elapsed = time.time() - t0
    parsed, err = validate_output(raw, name)
    return _format_result(name, parsed, err, elapsed, raw, raw_dump)


# ────────────────────────── score gate ──────────────────────────


def compute_gate(results: list[dict]) -> dict:
    """Apply §3 score gate: final_score = min(persona.score), map to status.

    Returns {"final_score": int|None, "status": str, "reason": str, "scored": [...]}.
    Errored personas are NOT counted toward the min — but if ANY persona errored,
    the gate is incomplete and we surface that in `reason`.
    """
    scored = [r for r in results if "score" in r]
    errored = [r for r in results if "error" in r]

    if not scored:
        return {
            "final_score": None,
            "status": "INCOMPLETE",
            "reason": "no personas produced a score",
            "scored": [],
        }

    final = min(r["score"] for r in scored)
    weakest = min(scored, key=lambda r: r["score"])

    if final >= 8:
        status, reason = "PASS", f"min score {final} from {weakest['persona']}"
    elif final >= 6:
        # WARN with autoFix → REVISE; otherwise NEEDS_HUMAN. autoFix presence
        # decides at the *fix-loop* layer (B.3). Gate just labels REVISE here.
        status = "REVISE"
        reason = f"min score {final} from {weakest['persona']} — autoFix or NEEDS_HUMAN"
    elif final >= 4:
        status = "NEEDS_HUMAN"
        reason = f"min score {final} from {weakest['persona']} — likely not patch-fixable"
    else:
        status = "REJECT"
        reason = f"min score {final} from {weakest['persona']} — block from students"

    if errored:
        reason += f"  (warning: {len(errored)} persona(s) errored — gate may be incomplete)"

    return {"final_score": final, "status": status, "reason": reason, "scored": scored}


# ────────────────────────── patch application (B.3) ──────────────────────────


class PatchError(Exception):
    """Raised when a patch cannot be applied safely."""


_PATH_TOKEN = re.compile(r"(\w+)|\[(\d+)\]")


def parse_path(path: str) -> list:
    """'content.choices[1]' -> ['content', 'choices', 1]."""
    parts: list = []
    pos = 0
    for m in _PATH_TOKEN.finditer(path):
        if m.start() != pos and path[pos:m.start()].strip(".") != "":
            raise PatchError(f"unexpected token at {pos}: {path!r}")
        key, idx = m.group(1), m.group(2)
        parts.append(int(idx) if idx is not None else key)
        pos = m.end()
    if not parts:
        raise PatchError(f"empty path: {path!r}")
    return parts


def get_path(obj, parts: list):
    cur = obj
    for p in parts:
        if isinstance(p, int):
            if not isinstance(cur, list) or p >= len(cur):
                raise PatchError(f"index out of range at {p} (path so far OK)")
            cur = cur[p]
        else:
            if not isinstance(cur, dict) or p not in cur:
                raise PatchError(f"missing key {p!r} (path so far OK)")
            cur = cur[p]
    return cur


def set_path(obj, parts: list, value) -> None:
    parent = get_path(obj, parts[:-1])
    last = parts[-1]
    if isinstance(last, int):
        if not isinstance(parent, list) or last >= len(parent):
            raise PatchError(f"cannot set index {last} on {type(parent).__name__}")
        parent[last] = value
    else:
        if not isinstance(parent, dict):
            raise PatchError(f"cannot set key {last!r} on {type(parent).__name__}")
        parent[last] = value


def apply_patch(problem: dict, patch: dict) -> None:
    """Apply one {path, before, after} patch in-place. Refuses if `before`
    doesn't match the current value (guards against stale or duplicated
    AUTO-FIX proposals from different rounds)."""
    for key in ("path", "before", "after"):
        if key not in patch:
            raise PatchError(f"patch missing key: {key}")
    parts = parse_path(patch["path"])
    current = get_path(problem, parts)
    if not isinstance(current, str) or not isinstance(patch["before"], str):
        raise PatchError(f"{patch['path']}: only string patches allowed (got {type(current).__name__})")
    if current != patch["before"]:
        raise PatchError(
            f"{patch['path']}: before mismatch — file has {current!r}, patch expects {patch['before']!r}"
        )
    set_path(problem, parts, patch["after"])


def gather_autofix_patches(results: list[dict]) -> list[dict]:
    """Collect every autoFix patch from every persona, annotated with the
    source persona for traceability."""
    out = []
    for r in results:
        af = r.get("autoFix")
        if not af or not isinstance(af, dict):
            continue
        for p in af.get("patches", []):
            out.append({**p, "_persona": r["persona"], "_reason": af.get("reason", "")})
    return out


def has_unaddressable_findings(results: list[dict]) -> tuple[bool, list[str]]:
    """Return (has, reasons). True if any persona is askHuman-only — i.e.
    has FAIL/WARN that can't be patched. These need regenerate (B.3.5) or
    human review."""
    reasons = []
    for r in results:
        if "score" not in r:
            continue
        if r["verdict"] == "FAIL":
            reasons.append(f"{r['persona']}: FAIL — {r.get('askHuman', 'no reason')}")
        elif r["verdict"] == "WARN" and not r.get("autoFix"):
            reasons.append(f"{r['persona']}: WARN with no autoFix — needs regenerate")
    return bool(reasons), reasons


# ────────────────────────── validation block + report (B.3) ──────────────────────────


def _persona_key(name: str) -> str:
    return name.replace("-", "_")


def _validator_model_summary() -> str:
    backends = sorted({cfg["backend"] for cfg in PERSONAS.values()})
    return "+".join(backends)


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def update_validation_block(
    problem: dict,
    gate: dict,
    results: list[dict],
    rounds: int,
    report_ref: str,
) -> None:
    """Write the validation block back into the problem dict per §10."""
    scores = {}
    for r in results:
        if "score" in r:
            scores[_persona_key(r["persona"])] = r["score"]
    problem["validation"] = {
        "status": gate["status"],
        "scores": scores,
        "verdict_at": _now_iso(),
        "validator_model": _validator_model_summary(),
        "rounds": rounds,
        "report_ref": report_ref,
    }


def report_path(problem_id: str) -> str:
    return os.path.join(REPORTS_DIR, f"{problem_id}.json")


def write_report(problem_id: str, history: list[dict], gate: dict) -> str:
    """Persist round-by-round raw results + final gate to validation-reports/{id}.json.

    Per §13 #5, reports are kept indefinitely (small JSON, lives in git)."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    payload = {
        "problemId": problem_id,
        "createdAt": _now_iso(),
        "rounds": history,
        "finalGate": gate,
        # B.5 will fill axisMerge after weighted-average across personas.
        "axisMerge": None,
    }
    path = report_path(problem_id)
    with open(path, "w") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return path


def save_problem(problem: dict) -> str:
    """Write the (possibly patched) problem back to disk where it was loaded from."""
    for d in (CURATED_DIR, RUNTIME_DIR):
        path = os.path.join(d, f"{problem['id']}.json")
        if os.path.exists(path):
            with open(path, "w") as f:
                json.dump(problem, f, ensure_ascii=False, indent=2)
                f.write("\n")
            return path
    raise SystemExit(f"cannot save: {problem['id']}.json not found in curated/ or generated/")


# ────────────────────────── fix-loop (B.3) ──────────────────────────


def _apply_all(problem: dict, patches: list[dict]) -> tuple[list[dict], list[dict]]:
    """Apply every patch; collect (applied, failed). Failures don't abort —
    one bad patch shouldn't kill the others."""
    applied, failed = [], []
    for p in patches:
        try:
            apply_patch(problem, p)
            applied.append(p)
        except PatchError as e:
            failed.append({**p, "_error": str(e)})
    return applied, failed


async def fix_loop(
    selected: list[str],
    problem: dict,
    chapter: dict,
    shared: str,
    raw_dump: bool,
    max_rounds: int,
) -> tuple[dict, list[dict], dict]:
    """Run review with up to max_rounds rounds of patching.

    Returns (final_problem, history, final_gate). `final_problem` is the
    snapshot that produced `final_gate` — possibly reverted to an earlier
    round if a later round regressed."""
    history: list[dict] = []
    # Round 1
    print(f"\n=== Round 1 ===")
    results = await run_all_async(selected, problem, chapter, shared, raw_dump)
    gate = compute_gate(results)
    history.append({
        "round": 1,
        "results": results,
        "gate": gate,
        "appliedPatches": [],
        "failedPatches": [],
    })
    best = {"round": 1, "score": gate["final_score"], "problem": copy.deepcopy(problem)}

    for rnd in range(2, max_rounds + 1):
        if gate["status"] == "PASS":
            print(f"\nstatus=PASS after round {rnd - 1} — done.")
            break
        if gate["status"] in ("REJECT", "NEEDS_HUMAN"):
            print(f"\nstatus={gate['status']} — patching won't help, stopping.")
            break
        has_bad, bad_reasons = has_unaddressable_findings(results)
        if has_bad:
            print(f"\n{len(bad_reasons)} persona(s) need human/regenerate, not patching:")
            for r in bad_reasons:
                print(f"  • {r}")
            gate = {**gate, "status": "NEEDS_HUMAN", "reason": gate["reason"] + "  (unaddressable findings present)"}
            history[-1]["gate"] = gate
            break

        patches = gather_autofix_patches(results)
        if not patches:
            print("\nno autoFix patches available — stopping.")
            break

        print(f"\napplying {len(patches)} autoFix patch(es) for round {rnd}…")
        applied, failed = _apply_all(problem, patches)
        for p in applied:
            print(f"  ✓ {p['_persona']:<22} {p['path']}  ({p['before']!r} → {p['after']!r})")
        for p in failed:
            print(f"  ✗ {p.get('_persona', '?'):<22} {p.get('path', '?')}  — {p['_error']}")

        if not applied:
            print("\nno patches applied successfully — stopping.")
            break

        # Re-run
        print(f"\n=== Round {rnd} ===")
        results = await run_all_async(selected, problem, chapter, shared, raw_dump)
        gate = compute_gate(results)
        history.append({
            "round": rnd,
            "results": results,
            "gate": gate,
            "appliedPatches": applied,
            "failedPatches": failed,
        })

        # §13 #6: revert if round N+1 score didn't improve over round N's best.
        if gate["final_score"] is not None and best["score"] is not None and gate["final_score"] <= best["score"]:
            print(f"\nround {rnd} score {gate['final_score']} did not exceed round {best['round']} score {best['score']} — reverting.")
            problem.clear()
            problem.update(copy.deepcopy(best["problem"]))
            # Use the *previous* best gate as final.
            gate = history[best["round"] - 1]["gate"]
            break
        best = {"round": rnd, "score": gate["final_score"], "problem": copy.deepcopy(problem)}
    else:
        print(f"\nmax_rounds={max_rounds} reached without PASS.")

    return problem, history, gate


# ────────────────────────── reporting ──────────────────────────


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

    gate = compute_gate(results)
    print("-" * 60)
    if gate["final_score"] is None:
        print(gate["reason"])
    else:
        print(f"final_score (min) = {gate['final_score']}  →  {gate['status']}   ({gate['reason']})")

    # Show critical/warn findings inline so the summary is actually useful.
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


# ────────────────────────── main ──────────────────────────


async def run_all_async(selected: list[str], problem: dict, chapter: dict, shared: str, raw_dump: bool) -> list[dict]:
    print(f"launching {len(selected)} personas in parallel…", flush=True)
    tasks = [run_persona_async(name, problem, chapter, shared, raw_dump) for name in selected]
    return await asyncio.gather(*tasks)


def main() -> int:
    ap = argparse.ArgumentParser(description="Phase B review board — single problem (B.3)")
    ap.add_argument("problem_id")
    ap.add_argument(
        "--personas",
        default=",".join(PERSONAS.keys()),
        help="comma-separated subset of personas (default: all 6)",
    )
    ap.add_argument("--raw", action="store_true", help="dump raw + parsed JSON per persona")
    ap.add_argument("--serial", action="store_true", help="legacy serial mode (debugging)")
    ap.add_argument("--apply", action="store_true", help="write validation block + patched problem + report to disk")
    ap.add_argument("--no-fix-loop", action="store_true", help="Round 1 only — no patching")
    ap.add_argument("--max-rounds", type=int, default=3, help="max fix-loop rounds (default 3)")
    args = ap.parse_args()

    selected = [p.strip() for p in args.personas.split(",") if p.strip()]
    unknown = [p for p in selected if p not in PERSONAS]
    if unknown:
        raise SystemExit(f"unknown personas: {unknown}  (valid: {list(PERSONAS)})")

    problem = load_problem(args.problem_id)
    if problem.get("schema") != "forming-problem/2.0":
        raise SystemExit(f"{args.problem_id} is not a v2 problem (schema={problem.get('schema')!r})")
    chapter = build_chapter_context(problem)
    shared = open(os.path.join(PROMPTS_DIR, "_shared.md")).read()

    wall_t0 = time.time()

    if args.serial or args.no_fix_loop:
        if args.serial:
            results = [run_persona(name, problem, chapter, shared, args.raw) for name in selected]
        else:
            results = asyncio.run(run_all_async(selected, problem, chapter, shared, args.raw))
        gate = compute_gate(results)
        history = [{"round": 1, "results": results, "gate": gate, "appliedPatches": [], "failedPatches": []}]
        rounds = 1
    else:
        problem, history, gate = asyncio.run(
            fix_loop(selected, problem, chapter, shared, args.raw, args.max_rounds)
        )
        results = history[-1]["results"]
        rounds = len(history)

    wall_elapsed = time.time() - wall_t0
    summarize(problem, results)
    print(f"\nwall time: {wall_elapsed:.1f}s  (mode: {'serial' if args.serial else 'parallel'}, rounds: {rounds})")

    if args.apply:
        if any("error" in r for r in results):
            print("\nrefusing to --apply: one or more personas errored. Investigate first.")
            return 1
        report = write_report(args.problem_id, history, gate)
        report_ref = os.path.relpath(report, ROOT)
        update_validation_block(problem, gate, results, rounds, report_ref)
        path = save_problem(problem)
        print(f"\nwrote validation block → {os.path.relpath(path, ROOT)}")
        print(f"wrote round-by-round report → {report_ref}")
    elif gate.get("status") and gate["status"] != "PASS":
        print("\n(dry-run — pass --apply to write validation block + report)")

    # Exit 0 if all parsed; non-zero if any errored — useful for CI later.
    return 1 if any("error" in r for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
