#!/usr/bin/env python3
"""Phase B review board — single-problem driver (B.1).

Loads a curated v2 problem, renders the six persona prompts with the
problem + chapter context, calls the claude CLI for each (using the
model distribution from docs/phase-b-review-design.md §6), validates
the JSON output, and prints a score table + findings summary.

B.1 scope:
  - single problem, serial calls (no asyncio, no fix-loop)
  - dry-run by default — does NOT write the validation block

  python3 scripts/review-problem.py g7s1-ch4-01
  python3 scripts/review-problem.py g7s1-ch4-01 --personas math-correctness,solvability
  python3 scripts/review-problem.py g7s1-ch4-01 --raw  # also dump raw JSON
"""

import argparse
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


def run_persona(name: str, problem: dict, chapter: dict, shared: str, raw_dump: bool) -> dict:
    cfg = PERSONAS[name]
    template = open(os.path.join(PROMPTS_DIR, cfg["file"])).read()
    context = build_context(problem, chapter)
    prompt = render_prompt(template, context, shared)

    label = f"[{name:<22} → {cfg['backend']:<6}]"
    print(f"{label} calling…", flush=True)
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
    print(f"{label} {verdict:<4} score={score}  findings={n_find}{auto}{ask}  ({elapsed:.1f}s)")
    if raw_dump:
        print(f"--- parsed ({name}) ---\n{json.dumps(parsed, ensure_ascii=False, indent=2)}\n--- end ---")
    parsed["elapsedSec"] = elapsed
    return parsed


# ────────────────────────── reporting ──────────────────────────


def summarize(problem: dict, results: list[dict]) -> None:
    scored = [r for r in results if "score" in r]
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

    if scored:
        final = min(r["score"] for r in scored)
        if final >= 8:
            status = "PASS"
        elif final >= 6:
            status = "REVISE  (autoFix or NEEDS_HUMAN)"
        elif final >= 4:
            status = "NEEDS_HUMAN"
        else:
            status = "REJECT"
        print("-" * 60)
        print(f"final_score (min) = {final}  →  {status}")
    else:
        print("\nno scored personas — cannot compute final_score")

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


def main() -> int:
    ap = argparse.ArgumentParser(description="Phase B review board — single problem (B.1)")
    ap.add_argument("problem_id")
    ap.add_argument(
        "--personas",
        default=",".join(PERSONAS.keys()),
        help="comma-separated subset of personas (default: all 6)",
    )
    ap.add_argument("--raw", action="store_true", help="dump raw + parsed JSON per persona")
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

    results = []
    for name in selected:
        results.append(run_persona(name, problem, chapter, shared, args.raw))

    summarize(problem, results)

    # Exit 0 if all parsed; non-zero if any errored — useful for CI later.
    return 1 if any("error" in r for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
