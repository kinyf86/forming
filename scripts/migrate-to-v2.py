#!/usr/bin/env python3
"""Migrate v1 problem JSONs to v2 schema (Phase A).

Wraps existing fields into the v2 envelope:
  - id/topicId/difficulty/concepts → top-level (mostly already there)
  - question/hints/choices/solution/answer/concepts → content{}
  - axes: omitted (Phase B review fills these)
  - provenance: inferred from filename prefix + git log
  - validation: cross-referenced from validation-reports/, defaults to UNCHECKED

Usage:
    python3 scripts/migrate-to-v2.py --dry-run             # preview diffs
    python3 scripts/migrate-to-v2.py --apply               # write in place
    python3 scripts/migrate-to-v2.py --apply --only g7s1   # filter by id prefix
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CURATED_DIR = os.path.join(ROOT, "src/data/problems/curated")
REPORTS_DIR = os.path.join(ROOT, "src/data/validation-reports")


def infer_source_model(problem_id: str, filepath: str) -> tuple[str, str]:
    """Return (source_model, generator)."""
    if problem_id.startswith(("g10", "g11", "g12")):
        return "opus", "generate-problems.py"
    if problem_id.startswith(("g5", "g6", "g7", "g8", "g9")):
        return "gemma", "generate-problems.py"
    if problem_id.startswith("gen-"):
        return "unknown", "api/generate-problem"
    return "unknown", "unknown"


def git_first_committed_at(filepath: str) -> str | None:
    rel = os.path.relpath(filepath, ROOT)
    try:
        out = subprocess.check_output(
            ["git", "log", "--diff-filter=A", "--format=%aI", "--", rel],
            cwd=ROOT,
            text=True,
        ).strip().splitlines()
        return out[-1] if out else None
    except subprocess.CalledProcessError:
        return None


def lookup_validation(problem_id: str) -> dict:
    candidates = [
        os.path.join(REPORTS_DIR, f"{problem_id}.json"),
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                report = json.loads(open(path, encoding="utf-8").read())
                return {
                    "status": report.get("verdict", "UNCHECKED"),
                    "scores": {
                        "math_correctness": report.get("quality", {}).get("score"),
                        "korean_naturalness": report.get("korean", {}).get("score"),
                    },
                    "verdict_at": report.get("evaluated_at"),
                    "validator_model": report.get("model", "opus"),
                    "report_ref": os.path.relpath(path, os.path.join(ROOT, "src/data")),
                }
            except (json.JSONDecodeError, KeyError):
                pass
    return {"status": "UNCHECKED"}


def to_v2(v1: dict, filepath: str) -> dict:
    if v1.get("schema") == "forming-problem/2.0":
        return v1  # already migrated

    problem_id = v1["id"]
    source_model, generator = infer_source_model(problem_id, filepath)
    generated_at = (
        git_first_committed_at(filepath)
        or datetime.fromtimestamp(os.path.getmtime(filepath), tz=timezone.utc).isoformat()
    )

    return {
        "schema": "forming-problem/2.0",
        "id": v1["id"],
        "topicId": v1["topicId"],
        "difficulty": v1["difficulty"],
        "content": {
            "question": v1["question"],
            **({"questionImage": v1["questionImage"]} if v1.get("questionImage") else {}),
            **({"diagram": v1["diagram"]} if v1.get("diagram") else {}),
            "hints": v1.get("hints", []),
            "choices": v1.get("choices", []),
            "solution": v1.get("solution", ""),
            **({"solutionDiagram": v1["solutionDiagram"]} if v1.get("solutionDiagram") else {}),
            "answer": v1.get("answer", ""),
            "concepts": v1.get("concepts", []),
        },
        "provenance": {
            "source_model": source_model,
            "generated_at": generated_at,
            "generator": generator,
        },
        "validation": lookup_validation(problem_id),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print diffs, do not write")
    ap.add_argument("--apply", action="store_true", help="write changes in place")
    ap.add_argument("--only", help="filter by filename prefix (e.g. g7s1)")
    args = ap.parse_args()

    if not args.dry_run and not args.apply:
        ap.error("must pass --dry-run or --apply")

    files = sorted(
        os.path.join(CURATED_DIR, f)
        for f in os.listdir(CURATED_DIR)
        if f.endswith(".json") and (not args.only or f.startswith(args.only))
    )

    migrated = 0
    skipped = 0
    malformed = []
    for path in files:
        v1 = json.loads(open(path, encoding="utf-8").read())
        if v1.get("schema") == "forming-problem/2.0":
            skipped += 1
            continue
        if "question" not in v1 or "id" not in v1:
            malformed.append(os.path.basename(path))
            continue
        v2 = to_v2(v1, path)
        if args.apply:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(v2, f, ensure_ascii=False, indent=2)
                f.write("\n")
        elif args.dry_run:
            print(f"[would migrate] {os.path.basename(path)} (source={v2['provenance']['source_model']}, validation={v2['validation']['status']})")
        migrated += 1

    print(f"\n{'migrated' if args.apply else 'would migrate'}: {migrated}, already-v2: {skipped}, total: {len(files)}")
    if malformed:
        print(f"malformed (skipped, missing required fields): {len(malformed)}")
        for name in malformed:
            print(f"  - {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
