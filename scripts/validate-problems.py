#!/usr/bin/env python3
"""Validate generated problems using Claude Opus.

Scores each problem on:
  1. 문제 품질 (problem quality, age-appropriate, clear answer)
  2. 수식/포맷 정합성 (LaTeX correctness, no broken symbols, JSON validity)
  3. 한글 표현력 (natural Korean, age-appropriate language)

Usage:
    # Validate specific files
    python3 scripts/validate-problems.py src/data/generated/g5-ch1-01.json

    # Validate all problems for a grade
    python3 scripts/validate-problems.py --grade 5

    # Validate problems generated in the last N minutes
    python3 scripts/validate-problems.py --since 10
"""

import argparse
import glob
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import llm
from lib import curriculum

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CURATED_DIR = os.path.join(ROOT, "src/data/problems/curated")
LEGACY_GENERATED_DIR = os.path.join(ROOT, "src/data/generated")
REPORTS_DIR = os.path.join(ROOT, "src/data/validation-reports")
os.makedirs(REPORTS_DIR, exist_ok=True)


VALIDATION_PROMPT = """당신은 한국 교육과정 전문가입니다. 아래 객관식 문제를 3가지 기준으로 엄격하게 평가하세요.

## 평가 대상 문제 (JSON)
{problem_json}

## 학생 수준
{grade_label}

## 평가 기준

### 1. 문제 품질 (1-10점)
- 학년 수준에 적합한가?
- 정답이 명확하고 단 하나만 존재하는가?
- 보기(choices)가 그럴듯한 오답인가?
- 풀이가 논리적이고 학생이 따라갈 수 있는가?
- 힌트가 답을 직접 알려주지 않으면서 도움이 되는가?
- 정답(answer)이 보기(choices) 중 하나와 정확히 일치하는가?

### 2. 수식/포맷 정합성 (1-10점)
- 모든 수식이 LaTeX (`$...$`) 형식인가?
- `1/2` 같은 평문 분수, `²`/`×`/`π` 같은 유니코드 수학기호가 없는가?
- LaTeX 명령어 (`\\frac`, `\\times`, `\\sqrt` 등)가 정확한가?
- KaTeX로 웹에서 렌더링 가능한가?

### 3. 한글 표현력 (1-10점)
- 한국 초등/중등/고등 학생에게 자연스러운 한국어인가?
- 학년 수준에 맞는 어휘인가?
- 한국 교육과정에서 사용하는 정확한 수학 용어를 쓰는가?
- 어색한 직역체나 영어 흔적이 없는가?

## 출력 형식 (JSON only)
{{
  "quality": {{"score": 1-10, "issues": ["문제점1", "문제점2"], "strengths": ["장점1"]}},
  "format": {{"score": 1-10, "issues": [], "strengths": []}},
  "korean": {{"score": 1-10, "issues": [], "strengths": []}},
  "overall_score": 1-10,
  "verdict": "PASS" or "REVISE" or "REJECT",
  "summary": "한 줄 평가"
}}

PASS: 모든 점수 8점 이상
REVISE: 일부 개선 필요 (5-7점)
REJECT: 심각한 문제 (4점 이하)

JSON만 출력하세요. 다른 텍스트 없이."""


def is_v2(problem: dict) -> bool:
    return problem.get("schema") == "forming-problem/2.0"


def to_validator_view(problem: dict) -> dict:
    """Flatten v2 → v1-shape so the existing validation prompt keeps working."""
    if not is_v2(problem):
        return problem
    flat = {
        "id": problem["id"],
        "topicId": problem["topicId"],
        "difficulty": problem["difficulty"],
        **problem["content"],
    }
    return flat


def validate_problem(problem_path: str, backend: str = "claude") -> dict:
    """Validate a single problem file. Returns the validation result."""
    problem = json.load(open(problem_path))
    chapter_id = problem.get("topicId", "")

    # Determine grade
    grade = 5
    if chapter_id.startswith(("math-", "sci-")):
        try:
            grade = int(chapter_id.split("-")[1])
        except (ValueError, IndexError):
            pass

    grade_label = curriculum.grade_label(grade)

    prompt = VALIDATION_PROMPT.format(
        problem_json=json.dumps(to_validator_view(problem), ensure_ascii=False, indent=2),
        grade_label=grade_label,
    )

    # Use Opus for validation (most accurate judge)
    import subprocess

    try:
        result = subprocess.run(
            [
                "claude",
                "-p",
                prompt,
                "--output-format",
                "text",
                "--model",
                "claude-opus-4-6",
            ],
            capture_output=True,
            text=True,
            timeout=180,
            stdin=subprocess.DEVNULL,
        )
        response = result.stdout.strip()
    except subprocess.TimeoutExpired:
        return {
            "problem_id": problem.get("id"),
            "verdict": "ERROR",
            "summary": "Validation timeout",
        }

    parsed = llm.parse_json(response)
    if not parsed:
        return {
            "problem_id": problem.get("id"),
            "verdict": "ERROR",
            "summary": "Could not parse validation response",
            "raw": response[:500],
        }

    parsed["problem_id"] = problem.get("id")
    parsed["chapter_id"] = chapter_id
    parsed["validated_at"] = datetime.now(timezone.utc).isoformat()

    if is_v2(problem):
        problem["validation"] = {
            "status": parsed.get("verdict", "UNCHECKED"),
            "scores": {
                "math_correctness": parsed.get("quality", {}).get("score"),
                "korean_naturalness": parsed.get("korean", {}).get("score"),
            },
            "verdict_at": parsed["validated_at"],
            "validator_model": "opus",
        }
        with open(problem_path, "w", encoding="utf-8") as f:
            json.dump(problem, f, ensure_ascii=False, indent=2)
            f.write("\n")

    return parsed


def find_problems(args) -> list:
    """Find problem files matching the args."""
    if args.files:
        return args.files

    # Match both old (g5-ch1) and new (g5s1-ch1) naming. Curated lives at
    # CURATED_DIR; legacy stragglers may still be in LEGACY_GENERATED_DIR.
    files = glob.glob(os.path.join(CURATED_DIR, "g*-ch*.json"))
    if os.path.isdir(LEGACY_GENERATED_DIR):
        files += glob.glob(os.path.join(LEGACY_GENERATED_DIR, "g*-ch*.json"))

    def matches_grade(path: str, g: int) -> bool:
        name = os.path.basename(path)
        # g5s1-... or g5-... (but not g50-)
        return name.startswith(f"g{g}s") or name.startswith(f"g{g}-")

    if args.grade:
        files = [f for f in files if matches_grade(f, args.grade)]

    if args.grades:
        start, end = map(int, args.grades.split("-"))
        files = [
            f for f in files if any(matches_grade(f, g) for g in range(start, end + 1))
        ]

    if args.since:
        cutoff = time.time() - (args.since * 60)
        files = [f for f in files if os.path.getmtime(f) > cutoff]

    return sorted(files)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="*", help="Specific problem files to validate")
    parser.add_argument("--grade", type=int)
    parser.add_argument("--grades", type=str, help="Range like 5-6")
    parser.add_argument(
        "--since", type=int, help="Validate files modified in last N minutes"
    )
    parser.add_argument("--report-name", type=str, default=None)
    args = parser.parse_args()

    files = find_problems(args)
    if not files:
        print("No problem files matched.")
        return

    print(f"=== Validating {len(files)} problems with Claude Opus ===\n")

    results = []
    for i, f in enumerate(files, start=1):
        problem_id = os.path.basename(f).replace(".json", "")
        print(f"[{i}/{len(files)}] {problem_id} ...", end=" ", flush=True)
        t0 = time.time()
        result = validate_problem(f)
        elapsed = time.time() - t0

        verdict = result.get("verdict", "ERROR")
        score = result.get("overall_score", "?")
        marker = {"PASS": "✓", "REVISE": "△", "REJECT": "✗", "ERROR": "?"}.get(
            verdict, "?"
        )
        print(f"{marker} {verdict} ({score}/10) ({elapsed:.1f}s)")
        if verdict in ("REVISE", "REJECT") and result.get("summary"):
            print(f"     → {result['summary']}")

        results.append(result)
        time.sleep(1)

    # Save report
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    report_name = args.report_name or f"validation-{timestamp}"
    report_path = os.path.join(REPORTS_DIR, f"{report_name}.json")
    summary = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total": len(results),
        "pass": sum(1 for r in results if r.get("verdict") == "PASS"),
        "revise": sum(1 for r in results if r.get("verdict") == "REVISE"),
        "reject": sum(1 for r in results if r.get("verdict") == "REJECT"),
        "error": sum(1 for r in results if r.get("verdict") == "ERROR"),
        "avg_quality": round(
            sum(
                r.get("quality", {}).get("score", 0)
                for r in results
                if isinstance(r.get("quality"), dict)
            )
            / max(1, len(results)),
            2,
        ),
        "avg_format": round(
            sum(
                r.get("format", {}).get("score", 0)
                for r in results
                if isinstance(r.get("format"), dict)
            )
            / max(1, len(results)),
            2,
        ),
        "avg_korean": round(
            sum(
                r.get("korean", {}).get("score", 0)
                for r in results
                if isinstance(r.get("korean"), dict)
            )
            / max(1, len(results)),
            2,
        ),
        "results": results,
    }
    with open(report_path, "w") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n=== Summary ===")
    print(f"Total: {summary['total']}")
    print(f"PASS:   {summary['pass']}")
    print(f"REVISE: {summary['revise']}")
    print(f"REJECT: {summary['reject']}")
    if summary["error"]:
        print(f"ERROR:  {summary['error']}")
    print(f"\n평균 점수:")
    print(f"  품질:   {summary['avg_quality']}/10")
    print(f"  포맷:   {summary['avg_format']}/10")
    print(f"  한국어: {summary['avg_korean']}/10")
    print(f"\nReport saved: {report_path}")


if __name__ == "__main__":
    main()
