"""Phase B review board — shared library.

Holds the persona invocation / score gate / patch / fix-loop / validation
write-back logic so both `review-problem.py` (single problem CLI) and
`review-batch.py` (batch CLI) can reuse it.

Pass `verbose=False` to silence per-persona / per-round prints when
running in batch mode.
"""

import asyncio
import copy
import datetime as _dt
import json
import os
import re
from typing import Optional

from . import curriculum, llm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROMPTS_DIR = os.path.join(ROOT, "src/data/prompts/review")
CURATED_DIR = os.path.join(ROOT, "src/data/problems/curated")
RUNTIME_DIR = os.path.join(ROOT, "src/data/generated")
REPORTS_DIR = os.path.join(ROOT, "src/data/validation-reports")

# §6 model distribution.
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


# ────────────────────────── loading ──────────────────────────


def load_problem(problem_id: str) -> dict:
    for d in (CURATED_DIR, RUNTIME_DIR):
        path = os.path.join(d, f"{problem_id}.json")
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
    raise SystemExit(f"problem not found: {problem_id} (checked curated + generated)")


def load_shared_prompt() -> str:
    return open(os.path.join(PROMPTS_DIR, "_shared.md")).read()


def build_chapter_context(problem: dict) -> dict:
    curricula = curriculum.load_all_curricula()
    chapter, cur = curriculum.find_chapter(curricula, problem["topicId"])
    if chapter is None:
        raise SystemExit(f"chapter not found for topicId={problem['topicId']}")
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
    def _if_repl(m: re.Match) -> str:
        return m.group(2) if context.get(m.group(1)) else ""
    rendered = _IF_BLOCK.sub(_if_repl, template)
    rendered = rendered.replace("{{shared}}", shared)
    def _var_repl(m: re.Match) -> str:
        return _format(_lookup(context, m.group(1)))
    return _VAR.sub(_var_repl, rendered)


def build_context(problem: dict, chapter: dict, attempt: int = 1) -> dict:
    return {
        "problem": problem,
        "problemJson": json.dumps(problem, ensure_ascii=False, indent=2),
        "chapter": dict(chapter, concepts=", ".join(chapter["concepts"])),
        "attempt": attempt,
        "previousFindings": None,
        "previousFindingsJson": "",
        "prerequisites": None,
    }


# ────────────────────────── persona invocation ──────────────────────────


def validate_output(raw: Optional[str], persona: str) -> tuple[Optional[dict], Optional[str]]:
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
        parsed["persona"] = persona
    return parsed, None


def _format_result(name: str, parsed: Optional[dict], err: Optional[str], elapsed: float, raw: Optional[str], raw_dump: bool, verbose: bool) -> dict:
    cfg = PERSONAS[name]
    label = f"[{name:<22} → {cfg['backend']:<6}]"
    if err:
        if verbose:
            print(f"{label} FAIL ({elapsed:.1f}s) — {err}")
        if raw_dump and raw:
            print(f"--- raw output ({name}) ---\n{raw}\n--- end ---")
        return {"persona": name, "error": err, "elapsedSec": elapsed, "rawOutput": raw}

    if verbose:
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
    return render_prompt(template, build_context(problem, chapter), shared)


async def run_persona_async(name: str, problem: dict, chapter: dict, shared: str, raw_dump: bool = False, verbose: bool = True) -> dict:
    cfg = PERSONAS[name]
    prompt = _prepare_prompt(name, problem, chapter, shared)
    import time
    t0 = time.time()
    raw = await llm.call_llm_async(prompt, backend=cfg["backend"], timeout=cfg["timeout"], retries=2, isolate_cwd=True)
    elapsed = time.time() - t0
    parsed, err = validate_output(raw, name)
    return _format_result(name, parsed, err, elapsed, raw, raw_dump, verbose)


def run_persona(name: str, problem: dict, chapter: dict, shared: str, raw_dump: bool = False, verbose: bool = True) -> dict:
    """Synchronous variant. Kept for --serial mode and easier debugging."""
    cfg = PERSONAS[name]
    prompt = _prepare_prompt(name, problem, chapter, shared)
    if verbose:
        print(f"[{name:<22} → {cfg['backend']:<6}] calling…", flush=True)
    import time
    t0 = time.time()
    raw = llm.call_llm(prompt, backend=cfg["backend"], timeout=cfg["timeout"], retries=2, isolate_cwd=True, silent_retry=True)
    elapsed = time.time() - t0
    parsed, err = validate_output(raw, name)
    return _format_result(name, parsed, err, elapsed, raw, raw_dump, verbose)


async def run_all_async(selected: list[str], problem: dict, chapter: dict, shared: str, raw_dump: bool = False, verbose: bool = True) -> list[dict]:
    if verbose:
        print(f"launching {len(selected)} personas in parallel…", flush=True)
    tasks = [run_persona_async(name, problem, chapter, shared, raw_dump, verbose) for name in selected]
    return await asyncio.gather(*tasks)


# ────────────────────────── score gate ──────────────────────────


def compute_gate(results: list[dict]) -> dict:
    scored = [r for r in results if "score" in r]
    errored = [r for r in results if "error" in r]
    if not scored:
        return {"final_score": None, "status": "INCOMPLETE", "reason": "no personas produced a score", "scored": []}
    final = min(r["score"] for r in scored)
    weakest = min(scored, key=lambda r: r["score"])
    if final >= 8:
        status, reason = "PASS", f"min score {final} from {weakest['persona']}"
    elif final >= 6:
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


# ────────────────────────── patch application ──────────────────────────


class PatchError(Exception):
    """Raised when a patch cannot be applied safely."""


_PATH_TOKEN = re.compile(r"(\w+)|\[(\d+)\]")


def parse_path(path: str) -> list:
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
    for key in ("path", "before", "after"):
        if key not in patch:
            raise PatchError(f"patch missing key: {key}")
    parts = parse_path(patch["path"])
    current = get_path(problem, parts)
    if not isinstance(current, str) or not isinstance(patch["before"], str):
        raise PatchError(f"{patch['path']}: only string patches allowed (got {type(current).__name__})")
    if current != patch["before"]:
        raise PatchError(f"{patch['path']}: before mismatch — file has {current!r}, patch expects {patch['before']!r}")
    set_path(problem, parts, patch["after"])


def gather_autofix_patches(results: list[dict]) -> list[dict]:
    out = []
    for r in results:
        af = r.get("autoFix")
        if not af or not isinstance(af, dict):
            continue
        for p in af.get("patches", []):
            out.append({**p, "_persona": r["persona"], "_reason": af.get("reason", "")})
    return out


def has_unaddressable_findings(results: list[dict]) -> tuple[bool, list[str]]:
    reasons = []
    for r in results:
        if "score" not in r:
            continue
        if r["verdict"] == "FAIL":
            reasons.append(f"{r['persona']}: FAIL — {r.get('askHuman', 'no reason')}")
        elif r["verdict"] == "WARN" and not r.get("autoFix"):
            reasons.append(f"{r['persona']}: WARN with no autoFix — needs regenerate")
    return bool(reasons), reasons


# ────────────────────────── validation block + report ──────────────────────────


def _persona_key(name: str) -> str:
    return name.replace("-", "_")


def _validator_model_summary() -> str:
    backends = sorted({cfg["backend"] for cfg in PERSONAS.values()})
    return "+".join(backends)


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def update_validation_block(problem: dict, gate: dict, results: list[dict], rounds: int, report_ref: str) -> None:
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
    os.makedirs(REPORTS_DIR, exist_ok=True)
    payload = {
        "problemId": problem_id,
        "createdAt": _now_iso(),
        "rounds": history,
        "finalGate": gate,
        "axisMerge": None,  # B.5
    }
    path = report_path(problem_id)
    with open(path, "w") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return path


def save_problem(problem: dict) -> str:
    for d in (CURATED_DIR, RUNTIME_DIR):
        path = os.path.join(d, f"{problem['id']}.json")
        if os.path.exists(path):
            with open(path, "w") as f:
                json.dump(problem, f, ensure_ascii=False, indent=2)
                f.write("\n")
            return path
    raise SystemExit(f"cannot save: {problem['id']}.json not found in curated/ or generated/")


# ────────────────────────── fix-loop ──────────────────────────


def _apply_all(problem: dict, patches: list[dict]) -> tuple[list[dict], list[dict]]:
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
    raw_dump: bool = False,
    max_rounds: int = 3,
    verbose: bool = True,
) -> tuple[dict, list[dict], dict]:
    """Run review with up to max_rounds rounds of patching. Returns
    (final_problem, history, final_gate)."""
    history: list[dict] = []
    if verbose:
        print("\n=== Round 1 ===")
    results = await run_all_async(selected, problem, chapter, shared, raw_dump, verbose)
    gate = compute_gate(results)
    history.append({"round": 1, "results": results, "gate": gate, "appliedPatches": [], "failedPatches": []})
    best = {"round": 1, "score": gate["final_score"], "problem": copy.deepcopy(problem)}

    for rnd in range(2, max_rounds + 1):
        if gate["status"] == "PASS":
            if verbose:
                print(f"\nstatus=PASS after round {rnd - 1} — done.")
            break
        if gate["status"] in ("REJECT", "NEEDS_HUMAN"):
            if verbose:
                print(f"\nstatus={gate['status']} — patching won't help, stopping.")
            break
        has_bad, bad_reasons = has_unaddressable_findings(results)
        if has_bad:
            if verbose:
                print(f"\n{len(bad_reasons)} persona(s) need human/regenerate, not patching:")
                for r in bad_reasons:
                    print(f"  • {r}")
            gate = {**gate, "status": "NEEDS_HUMAN", "reason": gate["reason"] + "  (unaddressable findings present)"}
            history[-1]["gate"] = gate
            break

        patches = gather_autofix_patches(results)
        if not patches:
            if verbose:
                print("\nno autoFix patches available — stopping.")
            break

        if verbose:
            print(f"\napplying {len(patches)} autoFix patch(es) for round {rnd}…")
        applied, failed = _apply_all(problem, patches)
        if verbose:
            for p in applied:
                print(f"  ✓ {p['_persona']:<22} {p['path']}  ({p['before']!r} → {p['after']!r})")
            for p in failed:
                print(f"  ✗ {p.get('_persona', '?'):<22} {p.get('path', '?')}  — {p['_error']}")

        if not applied:
            if verbose:
                print("\nno patches applied successfully — stopping.")
            break

        if verbose:
            print(f"\n=== Round {rnd} ===")
        results = await run_all_async(selected, problem, chapter, shared, raw_dump, verbose)
        gate = compute_gate(results)
        history.append({"round": rnd, "results": results, "gate": gate, "appliedPatches": applied, "failedPatches": failed})

        if gate["final_score"] is not None and best["score"] is not None and gate["final_score"] <= best["score"]:
            if verbose:
                print(f"\nround {rnd} score {gate['final_score']} did not exceed round {best['round']} score {best['score']} — reverting.")
            problem.clear()
            problem.update(copy.deepcopy(best["problem"]))
            gate = history[best["round"] - 1]["gate"]
            break
        best = {"round": rnd, "score": gate["final_score"], "problem": copy.deepcopy(problem)}
    else:
        if verbose:
            print(f"\nmax_rounds={max_rounds} reached without PASS.")

    return problem, history, gate


# ────────────────────────── top-level orchestration (for batch) ──────────────────────────


async def review_problem(
    problem_id: str,
    selected: Optional[list[str]] = None,
    max_rounds: int = 3,
    no_fix_loop: bool = False,
    raw_dump: bool = False,
    verbose: bool = True,
    apply_writeback: bool = False,
) -> dict:
    """High-level: load, run review (with or without fix-loop), optionally
    write back. Returns a result summary suitable for batch aggregation:

      {
        "id": str, "ok": bool, "status": str, "final_score": int|None,
        "rounds": int, "elapsedSec": float, "error": Optional[str],
        "reportRef": Optional[str], "savedPath": Optional[str],
      }
    """
    import time
    selected = selected or list(PERSONAS.keys())
    shared = load_shared_prompt()
    problem = load_problem(problem_id)
    if problem.get("schema") != "forming-problem/2.0":
        return {"id": problem_id, "ok": False, "status": "ERROR",
                "final_score": None, "rounds": 0, "elapsedSec": 0.0,
                "error": f"not a v2 problem (schema={problem.get('schema')!r})",
                "reportRef": None, "savedPath": None}
    chapter = build_chapter_context(problem)

    t0 = time.time()
    if no_fix_loop:
        results = await run_all_async(selected, problem, chapter, shared, raw_dump, verbose)
        gate = compute_gate(results)
        history = [{"round": 1, "results": results, "gate": gate, "appliedPatches": [], "failedPatches": []}]
    else:
        problem, history, gate = await fix_loop(selected, problem, chapter, shared, raw_dump, max_rounds, verbose)
        results = history[-1]["results"]
    rounds = len(history)
    elapsed = time.time() - t0

    report_ref = None
    saved_path = None
    err = None

    if any("error" in r for r in results):
        err = f"{sum('error' in r for r in results)} persona(s) errored"

    if apply_writeback and err is None:
        report = write_report(problem_id, history, gate)
        report_ref = os.path.relpath(report, ROOT)
        update_validation_block(problem, gate, results, rounds, report_ref)
        saved_path = save_problem(problem)
        saved_path = os.path.relpath(saved_path, ROOT)

    return {
        "id": problem_id,
        "ok": err is None,
        "status": gate.get("status", "ERROR"),
        "final_score": gate.get("final_score"),
        "rounds": rounds,
        "elapsedSec": elapsed,
        "error": err,
        "reportRef": report_ref,
        "savedPath": saved_path,
        "history": history,
        "finalProblem": problem,
    }
