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


# ────────────────────────── axis merge (B.5) ──────────────────────────


_AXIS_KEYS = {
    "orthogonal_concepts": "difficulty.orthogonal_concepts",
    "combination_mode": "difficulty.combination_mode",
    "misconception_tag": "cognitive.misconception_tag",
}


def _find_axis_payload(infs: Optional[dict], axis_short: str):
    """Search axisInferences recursively for the shortened axis name.

    Personas emit either `{combination_mode: {...}}`, `{difficulty.combination_mode: {...}}`,
    or `{difficulty: {combination_mode: {...}}}`. Be permissive about which shape we accept."""
    if not infs or not isinstance(infs, dict):
        return None
    if axis_short in infs:
        return infs[axis_short]
    for k, v in infs.items():
        if k == _AXIS_KEYS[axis_short]:
            return v
        if isinstance(k, str) and k.endswith(f".{axis_short}"):
            return v
        if isinstance(v, dict):
            r = _find_axis_payload(v, axis_short)
            if r is not None:
                return r
    return None


def _coerce_misconception_list(payload) -> list[dict]:
    """Normalize misconception_tag payloads into [{tag, confidence}, ...]."""
    if payload is None:
        return []
    # Some personas emit the list directly, some wrap it under {value, confidence}, some nest.
    if isinstance(payload, dict):
        if "value" in payload and isinstance(payload["value"], list):
            items = payload["value"]
        elif "misconception_tag" in payload:
            return _coerce_misconception_list(payload["misconception_tag"])
        else:
            return []
    elif isinstance(payload, list):
        items = payload
    else:
        return []

    out = []
    for it in items:
        if isinstance(it, str):
            out.append({"tag": it, "confidence": 0.6})
        elif isinstance(it, dict) and "tag" in it:
            try:
                conf = float(it.get("confidence", 0.6))
            except (TypeError, ValueError):
                conf = 0.6
            out.append({"tag": str(it["tag"]), "confidence": max(0.0, min(1.0, conf))})
    return out


def merge_axis_inferences(results: list[dict]) -> tuple[dict, dict]:
    """Walk every persona's axisInferences, merge into a ProblemAxes-shaped dict.

    Returns (axes, log) where:
      - axes: ready to drop into problem.axes (or None per axis if no evidence)
      - log: per-axis breakdown showing which personas contributed and with what confidence

    Merge rules per §2:
      - difficulty.orthogonal_concepts (int 1-5): confidence-weighted average, rounded.
      - difficulty.combination_mode (enum): value with the highest confidence wins.
      - cognitive.misconception_tag (list[str]): union by tag; final confidence = max across personas.
    """
    log: dict = {k: [] for k in _AXIS_KEYS.values()}
    int_votes: list[tuple[int, float, str]] = []      # (value, conf, persona)
    enum_votes: list[tuple[str, float, str]] = []     # (value, conf, persona)
    tag_votes: dict[str, dict] = {}                   # tag -> {confidence, personas}

    for r in results:
        infs = r.get("axisInferences")
        if not infs:
            continue
        persona = r.get("persona", "?")

        # orthogonal_concepts
        oc = _find_axis_payload(infs, "orthogonal_concepts")
        if isinstance(oc, dict) and "value" in oc:
            try:
                v = int(oc["value"])
                conf = float(oc.get("confidence", 0.6))
                int_votes.append((v, conf, persona))
                log["difficulty.orthogonal_concepts"].append({"persona": persona, "value": v, "confidence": conf})
            except (TypeError, ValueError):
                pass

        # combination_mode
        cm = _find_axis_payload(infs, "combination_mode")
        if isinstance(cm, dict) and "value" in cm:
            v = str(cm["value"])
            try:
                conf = float(cm.get("confidence", 0.6))
            except (TypeError, ValueError):
                conf = 0.6
            enum_votes.append((v, conf, persona))
            log["difficulty.combination_mode"].append({"persona": persona, "value": v, "confidence": conf})

        # misconception_tag
        mt = _find_axis_payload(infs, "misconception_tag")
        for item in _coerce_misconception_list(mt):
            tag = item["tag"]
            conf = item["confidence"]
            if tag not in tag_votes or conf > tag_votes[tag]["confidence"]:
                tag_votes[tag] = {"confidence": conf, "personas": [persona]}
            elif persona not in tag_votes[tag]["personas"]:
                tag_votes[tag]["personas"].append(persona)
            log["cognitive.misconception_tag"].append({"persona": persona, "tag": tag, "confidence": conf})

    axes: dict = {}

    if int_votes:
        total_conf = sum(c for _, c, _ in int_votes)
        if total_conf > 0:
            weighted = sum(v * c for v, c, _ in int_votes) / total_conf
            agg_conf = max(c for _, c, _ in int_votes)
            axes["difficulty.orthogonal_concepts"] = {
                "value": max(1, min(5, round(weighted))),
                "source": "ai",
                "confidence": round(agg_conf, 3),
            }

    if enum_votes:
        # Pick by confidence; tie-break: take the most common value at top confidence.
        enum_votes.sort(key=lambda t: t[1], reverse=True)
        best_conf = enum_votes[0][1]
        candidates = [v for v, c, _ in enum_votes if c == best_conf]
        # Pick the most-voted value among the top-confidence ones.
        best = max(set(candidates), key=candidates.count)
        axes["difficulty.combination_mode"] = {
            "value": best,
            "source": "ai",
            "confidence": round(best_conf, 3),
        }

    if tag_votes:
        # Sort tags by confidence desc for deterministic output.
        ordered = sorted(tag_votes.items(), key=lambda kv: kv[1]["confidence"], reverse=True)
        axes["cognitive.misconception_tag"] = {
            "value": [t for t, _ in ordered],
            "source": "ai",
            "confidence": round(max(d["confidence"] for _, d in ordered), 3),
        }

    return axes, log


def apply_merged_axes(problem: dict, merged: dict) -> dict:
    """Write merged axes onto problem.axes, but never overwrite a human-sourced axis.

    Returns a record of which axes were written / preserved / skipped, useful for the report."""
    existing = problem.get("axes") or {}
    final: dict = dict(existing)
    record = {"written": [], "preserved_human": [], "no_evidence": []}
    for name, payload in merged.items():
        cur = existing.get(name)
        if isinstance(cur, dict) and cur.get("source") == "human":
            record["preserved_human"].append(name)
            continue
        final[name] = payload
        record["written"].append(name)
    for name in _AXIS_KEYS.values():
        if name not in merged and name not in existing:
            record["no_evidence"].append(name)
    if final:
        problem["axes"] = final
    return record


def report_path(problem_id: str) -> str:
    return os.path.join(REPORTS_DIR, f"{problem_id}.json")


def write_report(
    problem_id: str,
    history: list[dict],
    gate: dict,
    axis_merge: Optional[dict] = None,
) -> str:
    os.makedirs(REPORTS_DIR, exist_ok=True)
    payload = {
        "problemId": problem_id,
        "createdAt": _now_iso(),
        "rounds": history,
        "finalGate": gate,
        "axisMerge": axis_merge,
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


# ────────────────────────── regenerate (B.3.5) ──────────────────────────


def _load_generator():
    """Lazy import of scripts/generate-problems.py (hyphenated filename →
    can't use a normal `import`). Returns the module so we can reuse
    build_prompt and normalize_problem without duplicating template logic."""
    import importlib.util
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(here, "generate-problems.py")
    spec = importlib.util.spec_from_file_location("_genproblems", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def summarize_for_regenerate(results: list[dict]) -> str:
    """Build the critique paragraph that gets injected into the generate prompt.

    Includes every persona's WARN/FAIL findings (severity warn or critical) and
    askHuman reason if present. Keep it tight — the generator already gets the
    chapter + difficulty + concepts context."""
    lines: list[str] = []
    for r in results:
        if "score" not in r:
            continue
        persona = r["persona"]
        verdict = r["verdict"]
        if verdict == "PASS":
            continue
        ask = r.get("askHuman")
        notable = [
            f for f in r.get("findings", [])
            if f.get("severity") in ("warn", "critical")
        ]
        if not ask and not notable:
            continue
        lines.append(f"[{persona} → {verdict} score={r['score']}]")
        if ask:
            lines.append(f"  • askHuman: {ask}")
        for f in notable:
            field = f.get("field", "?")
            msg = f.get("message", "")
            sug = f.get("suggestion")
            sug_s = f"  → {sug}" if sug else ""
            lines.append(f"  • [{f.get('severity', '?')}] {field}: {msg}{sug_s}")
    return "\n".join(lines)


async def regenerate_problem(
    problem: dict,
    chapter: dict,
    critique: str,
    backend: str = "opus",
    verbose: bool = True,
) -> Optional[dict]:
    """Build a fresh problem at the SAME id/topicId/difficulty, told to fix
    the failures the review surfaced. Returns a new ProblemV2 dict, or None
    on failure. Does NOT touch disk."""
    gen = _load_generator()
    # Re-use the generator's template + lesson context for parity with how the
    # problem was first created.
    skill = curriculum.load_skill("generate-narrative-problem")
    curricula = curriculum.load_all_curricula()
    same_subject = curriculum.get_same_subject_chapters_text(curricula, problem["topicId"])
    lesson_summary = curriculum.load_lesson_summary(problem["topicId"])

    grade = chapter["grade"]
    subject_label = "수학" if chapter["subject"] == "math" else "과학"

    # build_prompt expects a *chapter dict* shaped like curriculum.find_chapter
    # returns (with `chapter` key being the number). Fetch the raw chapter.
    raw_chapter, _ = curriculum.find_chapter(curricula, problem["topicId"])
    if raw_chapter is None:
        return None

    # Index inside the chapter — irrelevant for review, just keep it 1.
    base_prompt = gen.build_prompt(
        skill,
        raw_chapter,
        grade,
        subject_label,
        same_subject,
        lesson_summary,
        problem["difficulty"],
        problem["id"],
        problem["topicId"],
        1,
    )

    critique_block = f"""
---

## REGENERATION CRITIQUE (Phase B review board)

이 문제는 이전 라운드에서 다음 결함이 지적되었습니다.
새 문제를 생성할 때 이 결함을 반드시 해결하세요. 같은 id ({problem["id"]}) / topicId / difficulty는 유지하되,
문항·풀이·보기·힌트는 새로 작성해도 됩니다.

{critique}

---

위 결함을 모두 반영하여 새 문제를 출력하세요. JSON만, 다른 텍스트 없이.
"""

    prompt = base_prompt + critique_block

    if verbose:
        print(f"  regenerate via {backend} (critique={len(critique)} chars)…", flush=True)

    raw = await llm.call_llm_async(
        prompt,
        backend=backend,
        timeout=480,  # opus L3-L4 ceiling from generate-problems.py
        retries=2,
        isolate_cwd=True,
    )
    if not raw:
        return None
    parsed = llm.parse_json(raw)
    if not parsed:
        return None

    parsed = gen.normalize_problem(parsed, problem["id"], problem["topicId"], problem["difficulty"])

    # The generator produces v1-shaped flat dicts (question/choices/etc. at top).
    # Convert to v2 shape so the rest of the review pipeline keeps working.
    if parsed.get("schema") != "forming-problem/2.0":
        v2 = {
            "schema": "forming-problem/2.0",
            "id": parsed["id"],
            "topicId": parsed["topicId"],
            "difficulty": parsed["difficulty"],
            "content": {
                "question": parsed.get("question", ""),
                "hints": parsed.get("hints", []),
                "choices": parsed.get("choices", []),
                "solution": parsed.get("solution", ""),
                "answer": parsed.get("answer", ""),
                "concepts": parsed.get("concepts", []),
            },
            "provenance": {
                "source_model": backend if backend in ("opus", "sonnet", "haiku", "gemma") else "unknown",
                "generated_at": _now_iso(),
                "generator": "review-problem.py:regenerate",
            },
            "validation": problem.get("validation", {"status": "UNCHECKED"}),
        }
        # Carry optional content fields if the generator emitted them.
        for opt in ("questionImage", "diagram", "solutionDiagram"):
            if parsed.get(opt):
                v2["content"][opt] = parsed[opt]
        if "axes" in problem:
            v2["axes"] = problem["axes"]
        parsed = v2

    return parsed


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
    allow_regenerate: bool = True,
) -> tuple[dict, list[dict], dict]:
    """Run review with up to max_rounds rounds of patching/regenerate.

    Returns (final_problem, history, final_gate).

    If patches alone aren't enough (some persona is WARN-without-autoFix or
    FAIL with askHuman), the loop attempts one regenerate via
    regenerate_problem(). Limited to a single regenerate per fix_loop
    invocation — if that fresh draft still doesn't pass, we stop and the
    revert rule (§13 #6) keeps the best-so-far snapshot.
    """
    history: list[dict] = []
    if verbose:
        print("\n=== Round 1 ===")
    results = await run_all_async(selected, problem, chapter, shared, raw_dump, verbose)
    gate = compute_gate(results)
    history.append({"round": 1, "results": results, "gate": gate, "appliedPatches": [], "failedPatches": []})
    best = {"round": 1, "score": gate["final_score"], "problem": copy.deepcopy(problem)}
    regenerated_once = False

    for rnd in range(2, max_rounds + 1):
        if gate["status"] == "PASS":
            if verbose:
                print(f"\nstatus=PASS after round {rnd - 1} — done.")
            break
        if gate["status"] == "REJECT":
            if verbose:
                print(f"\nstatus=REJECT — score too low to recover, stopping.")
            break

        # Decide: patch or regenerate?
        patches = gather_autofix_patches(results)
        has_bad, bad_reasons = has_unaddressable_findings(results)
        used_regenerate = False
        applied: list[dict] = []
        failed: list[dict] = []

        if not patches and has_bad and allow_regenerate and not regenerated_once:
            # Pure regenerate path.
            critique = summarize_for_regenerate(results)
            if verbose:
                print(f"\nno autoFix patches but {len(bad_reasons)} unaddressable finding(s) — regenerating…")
            new_problem = await regenerate_problem(problem, chapter, critique, verbose=verbose)
            if not new_problem:
                if verbose:
                    print("regenerate returned no result — marking NEEDS_HUMAN.")
                gate = {**gate, "status": "NEEDS_HUMAN", "reason": gate["reason"] + "  (regenerate failed)"}
                history[-1]["gate"] = gate
                break
            problem.clear()
            problem.update(new_problem)
            regenerated_once = True
            used_regenerate = True
        elif patches:
            if verbose:
                print(f"\napplying {len(patches)} autoFix patch(es) for round {rnd}…")
            applied, failed = _apply_all(problem, patches)
            if verbose:
                for p in applied:
                    print(f"  ✓ {p['_persona']:<22} {p['path']}  ({p['before']!r} → {p['after']!r})")
                for p in failed:
                    print(f"  ✗ {p.get('_persona', '?'):<22} {p.get('path', '?')}  — {p['_error']}")
            if not applied:
                # Patches all failed and no regenerate option → stop.
                if has_bad and allow_regenerate and not regenerated_once:
                    # Try regenerate as a fallback.
                    critique = summarize_for_regenerate(results)
                    if verbose:
                        print(f"\nall patches failed and {len(bad_reasons)} unaddressable finding(s) remain — regenerating…")
                    new_problem = await regenerate_problem(problem, chapter, critique, verbose=verbose)
                    if not new_problem:
                        if verbose:
                            print("regenerate returned no result — marking NEEDS_HUMAN.")
                        gate = {**gate, "status": "NEEDS_HUMAN", "reason": gate["reason"] + "  (patch + regenerate failed)"}
                        history[-1]["gate"] = gate
                        break
                    problem.clear()
                    problem.update(new_problem)
                    regenerated_once = True
                    used_regenerate = True
                else:
                    if verbose:
                        print("\nno patches applied successfully — stopping.")
                    break
        else:
            # No patches, no regenerate option (either already used or disabled).
            if has_bad:
                if verbose:
                    print(f"\n{len(bad_reasons)} unaddressable finding(s), regenerate exhausted — NEEDS_HUMAN:")
                    for r in bad_reasons:
                        print(f"  • {r}")
                gate = {**gate, "status": "NEEDS_HUMAN", "reason": gate["reason"] + "  (unaddressable, regenerate exhausted)"}
                history[-1]["gate"] = gate
            else:
                if verbose:
                    print("\nno autoFix patches available — stopping.")
            break

        if verbose:
            print(f"\n=== Round {rnd} ===")
        results = await run_all_async(selected, problem, chapter, shared, raw_dump, verbose)
        gate = compute_gate(results)
        history.append({
            "round": rnd,
            "results": results,
            "gate": gate,
            "appliedPatches": applied,
            "failedPatches": failed,
            "regenerated": used_regenerate,
        })

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

    # Axis inference merge across the *final* round's persona outputs.
    merged_axes, axis_log = merge_axis_inferences(results)
    axis_record = None

    if apply_writeback and err is None:
        if merged_axes:
            axis_record = apply_merged_axes(problem, merged_axes)
        axis_merge_payload = {
            "merged": merged_axes,
            "byPersona": axis_log,
            "applied": axis_record,
        } if (merged_axes or axis_log) else None
        report = write_report(problem_id, history, gate, axis_merge=axis_merge_payload)
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
        "mergedAxes": merged_axes,
        "axisLog": axis_log,
        "axisApplyRecord": axis_record,
    }
