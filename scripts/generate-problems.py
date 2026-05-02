#!/usr/bin/env python3
"""Generate multiple choice problems for chapters using any LLM backend.

The same skill prompt and curriculum context apply regardless of backend
(Claude CLI or local Ollama Gemma). Pass --backend to choose.

Usage:
    # 26B Gemma (default, fast + good quality)
    python3 scripts/generate-problems.py --grades 5-6 --per-chapter 20

    # Claude CLI (highest quality, slowest)
    python3 scripts/generate-problems.py --grades 5-6 --backend claude --per-chapter 5

    # 31B Gemma for high school challenge problems
    python3 scripts/generate-problems.py --grades 10-12 --backend gemma:31b
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

# Add lib to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import llm
from lib import curriculum

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GENERATED_DIR = os.path.join(ROOT, "src/data/generated")
os.makedirs(GENERATED_DIR, exist_ok=True)


def get_difficulty_distribution(grade: int, total: int, max_difficulty: int = 4) -> list:
    """Return a list of difficulty levels totaling `total` problems.

    Adjusted by school level:
    - Elementary (3-6): half basic, half applied. No 심화/도전.
    - Middle (7-9): basic, applied, advanced.
    - High (10-12): basic, applied, advanced, challenge.

    `max_difficulty` caps levels (e.g., 2 means only L1-L2).
    """
    # Determine grade-allowed max
    if grade <= 6:
        grade_max = 2
    elif grade <= 9:
        grade_max = 3
    else:
        grade_max = 4
    cap = min(grade_max, max_difficulty)

    if cap == 1:
        return [1] * total
    if cap == 2:
        l1 = total // 2
        l2 = total - l1
        return [1] * l1 + [2] * l2
    if cap == 3:
        l1 = max(1, int(total * 0.35))
        l2 = max(1, int(total * 0.35))
        l3 = max(0, total - l1 - l2)
        return [1] * l1 + [2] * l2 + [3] * l3
    # cap == 4
    l1 = max(1, total // 4)
    l2 = max(1, total // 4)
    l3 = max(1, total // 4)
    l4 = max(0, total - l1 - l2 - l3)
    return [1] * l1 + [2] * l2 + [3] * l3 + [4] * l4


def chapter_short_id(chapter_id: str) -> str:
    """math-5-1-04 -> g5s1-ch4 style for problem IDs (includes semester)."""
    parts = chapter_id.split("-")
    if len(parts) < 4:
        return chapter_id
    grade = parts[1]
    semester = parts[2]
    chapter_num = int(parts[3])
    return f"g{grade}s{semester}-ch{chapter_num}"


def problem_exists(problem_id: str) -> bool:
    return os.path.exists(os.path.join(GENERATED_DIR, f"{problem_id}.json"))


HIGH_EFFORT_INSTRUCTION = """
## High-Effort Reasoning Required (L3-L4)

이 문제는 심화/도전 수준입니다. 아래 프로세스로 깊이 있게 추론한 뒤 문제를 설계하세요.

### Step 1: 기출 유형 탐색
- 중등 L3: 한국 내신/학력평가에서 이 단원의 고난도 유형을 상기하세요. 어떤 개념 조합, 어떤 함정이 자주 나오는지 떠올리세요.
- 고등 L3: 수능 모의고사 4점 문항의 전형적 유형을 참고하세요.
- 고등 L4: 수능 킬러(준킬러 포함) 문항 수준. 28-30번, 21번, 29-30번 유형의 구조와 난이도를 목표로 하세요.

### Step 2: 설계 초안
내부적으로 다음을 먼저 생각하세요 (출력에는 포함하지 않음):
1. 어떤 개념들을 조합할 것인가? (최소 2개)
2. 학생이 놓치기 쉬운 함정은 무엇인가?
3. 풀이 과정이 몇 단계인가? (L3는 3-4단계, L4는 4-6단계)
4. 각 오답(distractor)은 어떤 실수에서 나오는가? 5개 보기 각각의 실수 패턴을 명시.

### Step 3: 검증
문제를 작성한 뒤 내부적으로 검증:
- 풀이가 정답으로 정확히 이어지는가? 직접 처음부터 풀어보고 확인.
- 숫자가 나누어떨어지는지, 계산이 복잡하지만 가능한 수준인지.
- 보기 5개가 모두 구별되고 합리적 오답인지.
- 학년 수준에 맞는 어휘/기호를 쓰는지.

### Step 4: 출력
검증 통과한 최종 문제만 JSON으로 출력. 사고 과정은 출력하지 마세요.
"""


def build_prompt(
    skill: str,
    chapter,
    grade: int,
    subject: str,
    same_subject: str,
    lesson_summary: str,
    difficulty: int,
    problem_id: str,
    chapter_id: str,
    index: int,
) -> str:
    gl = curriculum.grade_label(grade)
    lp = curriculum.locale_prompt(grade)
    difficulty_label = {
        1: "기본 (Level 1)",
        2: "응용 (Level 2)",
        3: "심화 (Level 3)",
        4: "도전 (Level 4)",
    }.get(difficulty, "기본")

    high_effort = HIGH_EFFORT_INSTRUCTION if difficulty >= 3 else ""

    return f"""{skill}

---

## Context for This Problem

{lp}

- Student: {gl}
- Subject: {subject}
- Unit: {chapter['chapter']}단원 - {chapter['title']}
- Difficulty: {difficulty_label}
- Problem ID to use: {problem_id}
- Chapter ID (topicId): {chapter_id}
- Index in chapter: {index}

## Concepts in this unit
{', '.join(chapter['concepts'])}

## Lesson content (for reference)
{lesson_summary[:1500] if lesson_summary else '(no lesson reference available)'}

{high_effort}

Create ONE problem at the specified difficulty level.
Make it different from a typical rote computation — use a real Korean life scenario when possible.
Return valid JSON only. No other text."""


def normalize_problem(result: dict, problem_id: str, chapter_id: str, difficulty: int) -> dict:
    """Ensure required fields and validate answer is in choices."""
    result["id"] = problem_id
    result["topicId"] = chapter_id
    result["difficulty"] = difficulty

    # Validate answer is in choices
    if result.get("answer") and result.get("choices"):
        if result["answer"] not in result["choices"]:
            for c in result["choices"]:
                if (
                    result["answer"].strip() in c
                    or c.strip() in result["answer"]
                ):
                    result["answer"] = c
                    break

    return result


def generate_one(
    skill,
    chapter_info,
    same_subject,
    lesson_summary,
    difficulty,
    index,
    backend,
):
    chapter = chapter_info["chapter"]
    grade = chapter_info["grade"]
    subject = chapter_info["subject_label"]
    chapter_id = chapter["id"]
    short_id = chapter_short_id(chapter_id)
    problem_id = f"{short_id}-{index:02d}"

    if problem_exists(problem_id):
        return "skip", problem_id

    prompt = build_prompt(
        skill,
        chapter,
        grade,
        subject,
        same_subject,
        lesson_summary,
        difficulty,
        problem_id,
        chapter_id,
        index,
    )

    # L3-L4 on Opus needs more time for deep reasoning
    timeout = 480 if (difficulty >= 3 and backend == "opus") else 240
    response = llm.call_llm(prompt, backend=backend, timeout=timeout)
    if not response:
        return "fail", problem_id

    parsed = llm.parse_json(response)
    if not parsed:
        return "fail", problem_id

    parsed = normalize_problem(parsed, problem_id, chapter_id, difficulty)

    path = os.path.join(GENERATED_DIR, f"{problem_id}.json")
    with open(path, "w") as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2)
    return "ok", problem_id


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", default="math", choices=["math", "sci"])
    parser.add_argument("--grade", type=int, help="Specific grade (e.g. 5)")
    parser.add_argument("--grades", type=str, help="Range like 5-6 or 7-9")
    parser.add_argument("--per-chapter", type=int, default=20)
    parser.add_argument(
        "--max-difficulty",
        type=int,
        default=4,
        choices=[1, 2, 3, 4],
        help="Cap difficulty (e.g., 2 = only L1-L2)",
    )
    parser.add_argument(
        "--backend",
        default="gemma:26b",
        choices=list(llm.MODEL_MAP.keys()),
        help="LLM backend for L1-L2 problems",
    )
    parser.add_argument(
        "--advanced-backend",
        default=None,
        choices=list(llm.MODEL_MAP.keys()),
        help="LLM backend for L3-L4 problems (defaults to same as --backend)",
    )
    parser.add_argument(
        "--start-from",
        type=str,
        help="Skip until this chapter ID (resume mode)",
    )
    args = parser.parse_args()

    if args.grades:
        start, end = map(int, args.grades.split("-"))
        target_grades = list(range(start, end + 1))
    elif args.grade:
        target_grades = [args.grade]
    else:
        target_grades = None

    curricula = curriculum.load_all_curricula()
    skill = curriculum.load_skill("generate-narrative-problem")

    chapters = curriculum.get_chapters(
        curricula, subject=args.subject, grades=target_grades
    )

    if args.start_from:
        # Skip until we hit start_from
        idx = next(
            (i for i, c in enumerate(chapters) if c["chapter"]["id"] == args.start_from),
            None,
        )
        if idx is not None:
            chapters = chapters[idx:]

    advanced_backend = args.advanced_backend or args.backend
    info_basic = llm.get_backend_info(args.backend)
    info_adv = llm.get_backend_info(advanced_backend)
    print(f"=== Generation Plan ===")
    print(f"L1-L2 Backend: {info_basic.get('name')}")
    if advanced_backend != args.backend:
        print(f"L3-L4 Backend: {info_adv.get('name')}")
    print(f"Chapters: {len(chapters)}")
    print(f"Per chapter: {args.per_chapter}")
    print(f"Total problems: {len(chapters) * args.per_chapter}")
    print(f"Subject: {args.subject}")
    print(f"Grades: {target_grades or 'all'}")
    print()

    totals = {"ok": 0, "skip": 0, "fail": 0}
    start_time = time.time()

    for ci in chapters:
        ch = ci["chapter"]
        grade = ci["grade"]
        chapter_id = ch["id"]
        same_subject = curriculum.get_same_subject_chapters_text(curricula, chapter_id)
        lesson_summary = curriculum.load_lesson_summary(chapter_id)
        difficulties = get_difficulty_distribution(grade, args.per_chapter, args.max_difficulty)

        print(f"\n  {chapter_id}: {ch['title']}")
        for i, diff in enumerate(difficulties, start=1):
            # Route L3-L4 to advanced backend
            backend_for_this = advanced_backend if diff >= 3 else args.backend
            backend_tag = "opus" if backend_for_this != args.backend and diff >= 3 else ""
            print(f"    [{i:02d}/{len(difficulties)}] L{diff}{' ['+backend_tag+']' if backend_tag else ''} ...", end=" ", flush=True)
            t0 = time.time()
            status, pid = generate_one(
                skill,
                ci,
                same_subject,
                lesson_summary,
                diff,
                i,
                backend_for_this,
            )
            elapsed = time.time() - t0
            mark = "✓" if status == "ok" else "SKIP" if status == "skip" else "✗"
            print(f"{pid} {mark} ({elapsed:.1f}s)")
            totals[status] += 1
            time.sleep(1)

    elapsed_total = time.time() - start_time
    mins = int(elapsed_total // 60)
    secs = int(elapsed_total % 60)
    print(f"\n=== Done in {mins}m {secs}s ===")
    print(f"Generated: {totals['ok']}")
    print(f"Skipped (existed): {totals['skip']}")
    print(f"Failed: {totals['fail']}")


if __name__ == "__main__":
    main()
