#!/usr/bin/env python3
"""Generate narrative word problems for chapters.

Creates 5 problems per chapter: 2 at Level 2 (보통), 3 at Level 3 (심화).
For elementary (grades 3-6), uses Level 2-3. For middle/high, scales up.
"""

import json
import glob
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GENERATED_DIR = os.path.join(ROOT, "src/data/generated")
CURRICULUM_DIR = os.path.join(ROOT, "src/data/curriculum")
LESSONS_DIR = os.path.join(ROOT, "src/data/lessons")
SKILL_PATH = os.path.join(ROOT, "src/data/prompts/generate-narrative-problem.md")

os.makedirs(GENERATED_DIR, exist_ok=True)


def load_skill_prompt():
    return open(SKILL_PATH).read()


def load_all_curricula():
    curricula = []
    for f in sorted(glob.glob(os.path.join(CURRICULUM_DIR, "*.json"))):
        curricula.append(json.load(open(f)))
    return curricula


def load_lesson_summary(chapter_id):
    """Load the first 300 chars of each concept's explanation for context."""
    path = os.path.join(LESSONS_DIR, f"{chapter_id}.json")
    if not os.path.exists(path):
        return ""
    data = json.load(open(path))
    lines = []
    for l in data.get("lessons", []):
        concept = l.get("concept", "")
        explanation = l.get("explanation", "")[:300]
        lines.append(f"- {concept}: {explanation}...")
    return "\n".join(lines)


def grade_label(grade):
    if grade <= 6:
        return f"초등학교 {grade}학년"
    elif grade <= 9:
        return f"중학교 {grade - 6}학년"
    else:
        return f"고등학교 {grade - 9}학년"


def get_difficulty_range(grade):
    """Return (level2_count, level3_count, level4_count) for each grade."""
    if grade <= 6:
        return (2, 3, 0)  # 보통 2, 심화 3
    elif grade <= 9:
        return (2, 2, 1)  # 보통 2, 심화 2, 도전 1
    else:
        return (1, 2, 2)  # 보통 1, 심화 2, 도전 2


def call_claude(prompt, retries=2, timeout=240):
    for attempt in range(retries):
        try:
            result = subprocess.run(
                ["claude", "-p", prompt, "--output-format", "text", "--model", "claude-sonnet-4-6"],
                capture_output=True, text=True, timeout=timeout,
                stdin=subprocess.DEVNULL
            )
            text = result.stdout.strip()
            text = re.sub(r"^```json?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            match = re.search(r"\{[\s\S]*\}", text)
            if match:
                return json.loads(match.group(), strict=False)
        except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
            print(f"(retry {attempt + 1}: {type(e).__name__}) ", end="", flush=True)
            if attempt < retries - 1:
                time.sleep(5)
    return None


def get_chapter_num_str(chapter_id):
    """math-5-1-04 → ch4, math-5-2-03 → ch3 (simple chapter number)"""
    match = re.match(r"(?:math|sci)-\d+-\d+-(\d+)", chapter_id)
    return f"ch{int(match.group(1))}" if match else "ch0"


def problem_exists(problem_id):
    return os.path.exists(os.path.join(GENERATED_DIR, f"{problem_id}.json"))


def generate_problem(chapter, grade, subject, skill_prompt, difficulty, index, lesson_summary):
    gl = grade_label(grade)
    chapter_id = chapter["id"]
    ch_str = get_chapter_num_str(chapter_id)
    problem_id = f"g{grade}-{ch_str}-{index:02d}"

    if problem_exists(problem_id):
        return "skip", problem_id

    difficulty_label = {2: "보통 (응용)", 3: "심화", 4: "도전"}.get(difficulty, "보통")

    prompt = f"""{skill_prompt}

---

## Context for This Problem

- Student: {gl}
- Subject: {subject}
- Unit: {chapter['chapter']}단원 - {chapter['title']}
- Difficulty: Level {difficulty} ({difficulty_label})
- Problem ID to use: {problem_id}
- Chapter ID (topicId): {chapter_id}
- Index in chapter: {index}

## Concepts in this unit
{', '.join(chapter['concepts'])}

## Lesson content (for reference)
{lesson_summary[:1500] if lesson_summary else '(no lesson reference available)'}

Create ONE narrative word problem at the specified difficulty level.
Make it different from a typical rote computation — use a real Korean life scenario.
Return valid JSON only. No other text."""

    result = call_claude(prompt)
    if not result:
        return "fail", problem_id

    # Ensure required fields
    result["id"] = problem_id
    result["topicId"] = chapter_id
    result["difficulty"] = difficulty

    # Validate answer is in choices
    if result.get("answer") and result.get("choices"):
        if result["answer"] not in result["choices"]:
            # Try to match loosely
            for c in result["choices"]:
                if result["answer"].strip() in c or c.strip() in result["answer"]:
                    result["answer"] = c
                    break

    path = os.path.join(GENERATED_DIR, f"{problem_id}.json")
    with open(path, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    return "ok", problem_id


def generate_chapter_problems(chapter, grade, subject, skill_prompt):
    l2, l3, l4 = get_difficulty_range(grade)
    lesson_summary = load_lesson_summary(chapter["id"])

    print(f"\n  {chapter['id']}: {chapter['title']} ({l2} 보통 + {l3} 심화 + {l4} 도전)")

    results = {"ok": 0, "skip": 0, "fail": 0}
    idx = 1
    for _ in range(l2):
        print(f"    [{idx}/{l2 + l3 + l4}] Level 2 ...", end=" ", flush=True)
        status, pid = generate_problem(chapter, grade, subject, skill_prompt, 2, idx, lesson_summary)
        print(f"{pid} {'✓' if status == 'ok' else 'SKIP' if status == 'skip' else '✗'}")
        results[status] += 1
        idx += 1
        time.sleep(2)

    for _ in range(l3):
        print(f"    [{idx}/{l2 + l3 + l4}] Level 3 ...", end=" ", flush=True)
        status, pid = generate_problem(chapter, grade, subject, skill_prompt, 3, idx, lesson_summary)
        print(f"{pid} {'✓' if status == 'ok' else 'SKIP' if status == 'skip' else '✗'}")
        results[status] += 1
        idx += 1
        time.sleep(2)

    for _ in range(l4):
        print(f"    [{idx}/{l2 + l3 + l4}] Level 4 ...", end=" ", flush=True)
        status, pid = generate_problem(chapter, grade, subject, skill_prompt, 4, idx, lesson_summary)
        print(f"{pid} {'✓' if status == 'ok' else 'SKIP' if status == 'skip' else '✗'}")
        results[status] += 1
        idx += 1
        time.sleep(2)

    return results


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", choices=["math", "sci"], default="math")
    parser.add_argument("--grade", type=int, help="Generate for a specific grade")
    parser.add_argument("--grades", type=str, help="Range like 5-6 or 7-9")
    args = parser.parse_args()

    curricula = load_all_curricula()
    skill_prompt = load_skill_prompt()

    if args.grades:
        start, end = map(int, args.grades.split("-"))
        target_grades = list(range(start, end + 1))
    elif args.grade:
        target_grades = [args.grade]
    else:
        target_grades = [5, 6]

    chapters_to_process = []
    for cur in curricula:
        if cur["subject"] != ("math" if args.subject == "math" else "science"):
            continue
        if cur["grade"] not in target_grades:
            continue
        for sem in cur["semesters"]:
            for ch in sem["chapters"]:
                chapters_to_process.append((ch, cur["grade"], cur["subject"]))

    print(f"=== Generating narrative problems for {len(chapters_to_process)} chapters ===")
    print(f"Target grades: {target_grades}")

    totals = {"ok": 0, "skip": 0, "fail": 0}
    for ch, grade, subject in chapters_to_process:
        subject_label = "수학" if subject == "math" else "과학"
        r = generate_chapter_problems(ch, grade, subject_label, skill_prompt)
        for k in totals:
            totals[k] += r[k]

    print(f"\n=== Done ===")
    print(f"Generated: {totals['ok']}")
    print(f"Skipped (exists): {totals['skip']}")
    print(f"Failed: {totals['fail']}")


if __name__ == "__main__":
    main()
