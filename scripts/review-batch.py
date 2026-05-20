#!/usr/bin/env python3
"""Phase B review board — batch CLI.

Runs the six-persona review on many problems concurrently. Filters by
grade / semester / subject / chapter / status. Each problem still runs
its six personas internally in parallel, so the outer --concurrency N
means up to N × 6 simultaneous claude CLI subprocesses.

  python3 scripts/review-batch.py --grade 7                        # dry-run, all g7
  python3 scripts/review-batch.py --grade 7 --semester 1 --apply   # write back
  python3 scripts/review-batch.py --status UNCHECKED --concurrency 2
  python3 scripts/review-batch.py --grade 7 --chapter 4            # narrow
  python3 scripts/review-batch.py --ids g7s1-ch4-01,g7s1-ch5-01    # explicit list
  python3 scripts/review-batch.py --grade 7 --limit 3              # cap

§13 #4: default --concurrency 4. Adjust based on rate-limit observation.
"""

import argparse
import asyncio
import json
import os
import re
import sys
import time
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import review as R

_ID_RE = re.compile(r"^g(\d+)s(\d+)-ch(\d+)-(\d+)$")


def parse_problem_id(pid: str) -> Optional[dict]:
    """g7s1-ch4-01 → {grade:7, semester:1, chapter:4, seq:1}. None if not matching."""
    m = _ID_RE.match(pid)
    if not m:
        return None
    return {
        "grade": int(m.group(1)),
        "semester": int(m.group(2)),
        "chapter": int(m.group(3)),
        "seq": int(m.group(4)),
    }


def subject_of(problem: dict) -> str:
    """topicId like math-7-1-04 / sci-9-2-01 → 'math' / 'sci' / 'other'."""
    tid = problem.get("topicId", "")
    if tid.startswith("math-"):
        return "math"
    if tid.startswith("sci-"):
        return "sci"
    return "other"


def discover_problems(
    grade: Optional[int],
    semester: Optional[int],
    chapter: Optional[int],
    subject: Optional[str],
    status: Optional[str],
    explicit_ids: Optional[list[str]],
) -> list[str]:
    """Walk curated/ (and generated/ if explicit ids reach there), apply filters,
    return matching problem ids."""
    if explicit_ids:
        return explicit_ids

    ids = []
    for fn in sorted(os.listdir(R.CURATED_DIR)):
        if not fn.endswith(".json"):
            continue
        pid = fn[:-5]
        meta = parse_problem_id(pid)
        if meta is None:
            # gen-* runtime-cached entries; only include if filters allow them.
            if grade is not None or semester is not None or chapter is not None:
                continue
        else:
            if grade is not None and meta["grade"] != grade:
                continue
            if semester is not None and meta["semester"] != semester:
                continue
            if chapter is not None and meta["chapter"] != chapter:
                continue

        # subject / status filters need to peek inside.
        if subject is not None or status is not None:
            try:
                with open(os.path.join(R.CURATED_DIR, fn)) as f:
                    p = json.load(f)
            except Exception:
                continue
            if subject is not None and subject_of(p) != subject:
                continue
            if status is not None:
                cur = p.get("validation", {}).get("status", "UNCHECKED")
                if cur != status:
                    continue
        ids.append(pid)
    return ids


async def review_one_under_semaphore(sem: asyncio.Semaphore, problem_id: str, idx: int, total: int, args) -> dict:
    async with sem:
        t0 = time.time()
        print(f"[{idx:>3}/{total}] {problem_id} … starting", flush=True)
        try:
            res = await R.review_problem(
                problem_id,
                selected=None,
                max_rounds=args.max_rounds,
                no_fix_loop=args.no_fix_loop,
                raw_dump=False,
                verbose=False,
                apply_writeback=args.apply,
            )
        except Exception as e:
            elapsed = time.time() - t0
            print(f"[{idx:>3}/{total}] {problem_id} ✗ EXCEPTION {type(e).__name__}: {e}  ({elapsed:.0f}s)", flush=True)
            return {
                "id": problem_id, "ok": False, "status": "ERROR",
                "final_score": None, "rounds": 0, "elapsedSec": elapsed,
                "error": f"{type(e).__name__}: {e}", "reportRef": None, "savedPath": None,
            }
        # Trim verbose fields for batch progress; full history is still on disk if --apply.
        trimmed = {k: v for k, v in res.items() if k not in ("history", "finalProblem")}
        score = trimmed["final_score"]
        score_s = f"{score}" if score is not None else "—"
        flag = "✓" if trimmed["ok"] and trimmed["status"] == "PASS" else "•"
        if trimmed["status"] in ("REJECT", "ERROR"):
            flag = "✗"
        applied = " applied" if args.apply and trimmed.get("savedPath") else ""
        err = f"  ({trimmed['error']})" if trimmed.get("error") else ""
        print(
            f"[{idx:>3}/{total}] {problem_id} {flag} {trimmed['status']:<12} "
            f"score={score_s:<3} rounds={trimmed['rounds']} "
            f"{trimmed['elapsedSec']:.0f}s{applied}{err}",
            flush=True,
        )
        return trimmed


async def run_batch(ids: list[str], args) -> list[dict]:
    sem = asyncio.Semaphore(args.concurrency)
    tasks = [review_one_under_semaphore(sem, pid, i + 1, len(ids), args) for i, pid in enumerate(ids)]
    return await asyncio.gather(*tasks)


def aggregate(results: list[dict], wall: float, concurrency: int) -> None:
    counts: dict[str, int] = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    print()
    print("=" * 50)
    print(f"batch summary — {len(results)} problem(s) in {wall:.0f}s")
    print("=" * 50)
    for status in ("PASS", "REVISE", "NEEDS_HUMAN", "REJECT", "INCOMPLETE", "ERROR"):
        if status in counts:
            print(f"  {status:<14} {counts[status]:>3}")
    other = sorted(s for s in counts if s not in ("PASS", "REVISE", "NEEDS_HUMAN", "REJECT", "INCOMPLETE", "ERROR"))
    for status in other:
        print(f"  {status:<14} {counts[status]:>3}")

    if results:
        total_review = sum(r["elapsedSec"] for r in results)
        avg = total_review / len(results)
        print(f"\n  avg per-problem time: {avg:.0f}s  (cumulative review: {total_review:.0f}s, wall: {wall:.0f}s)")
        speedup = total_review / wall if wall > 0 else 0
        print(f"  effective speedup from --concurrency {concurrency}: {speedup:.1f}x")

    # Highlight failures.
    failures = [r for r in results if not r["ok"]]
    if failures:
        print(f"\nfailures ({len(failures)}):")
        for r in failures:
            print(f"  - {r['id']}: {r['status']} — {r.get('error') or '(no error message)'}")

    # Highlight NEEDS_HUMAN.
    need_human = [r for r in results if r["status"] == "NEEDS_HUMAN"]
    if need_human:
        print(f"\nneeds human review ({len(need_human)}):")
        for r in need_human:
            print(f"  - {r['id']}: final_score={r['final_score']}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Phase B review board — batch")
    ap.add_argument("--grade", type=int, help="filter by grade (3-12)")
    ap.add_argument("--semester", type=int, choices=[1, 2], help="filter by semester")
    ap.add_argument("--chapter", type=int, help="filter by chapter number")
    ap.add_argument("--subject", choices=["math", "sci"], help="filter by subject")
    ap.add_argument("--status", help="filter by current validation.status (e.g. UNCHECKED, REVISE)")
    ap.add_argument("--ids", help="explicit comma-separated problem ids (overrides filters)")
    ap.add_argument("--limit", type=int, help="cap the number of problems processed")
    ap.add_argument("--concurrency", type=int, default=4, help="problems processed in parallel (default 4)")
    ap.add_argument("--max-rounds", type=int, default=3, help="fix-loop rounds per problem (default 3)")
    ap.add_argument("--no-fix-loop", action="store_true", help="Round 1 only — no patching")
    ap.add_argument("--apply", action="store_true", help="write back validation + reports + patched problem")
    ap.add_argument("--dry-list", action="store_true", help="print the matched ids and exit (no reviews)")
    args = ap.parse_args()

    explicit = [s.strip() for s in args.ids.split(",")] if args.ids else None
    ids = discover_problems(
        grade=args.grade,
        semester=args.semester,
        chapter=args.chapter,
        subject=args.subject,
        status=args.status,
        explicit_ids=explicit,
    )
    if args.limit:
        ids = ids[: args.limit]

    if not ids:
        print("no problems matched the filter.")
        return 0

    print(f"matched {len(ids)} problem(s):")
    for pid in ids[: min(20, len(ids))]:
        print(f"  - {pid}")
    if len(ids) > 20:
        print(f"  …and {len(ids) - 20} more")
    print()

    if args.dry_list:
        return 0

    print(f"starting batch  (concurrency={args.concurrency}, fix-loop={'off' if args.no_fix_loop else 'on'}, apply={args.apply})")
    print()

    t0 = time.time()
    results = asyncio.run(run_batch(ids, args))
    wall = time.time() - t0

    aggregate(results, wall, args.concurrency)

    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
