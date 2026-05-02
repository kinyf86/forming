#!/usr/bin/env python3
"""Fill in missing concepts for existing lesson files."""

import json
import glob
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS_DIR = os.path.join(ROOT, "src/data/lessons")
CURRICULUM_DIR = os.path.join(ROOT, "src/data/curriculum")
SKILL_PATH = os.path.join(ROOT, "src/data/prompts/generate-lesson.md")


def load_skill_prompt():
    with open(SKILL_PATH) as f:
        return f.read()


def load_all_curricula():
    curricula = []
    for f in sorted(glob.glob(os.path.join(CURRICULUM_DIR, "*.json"))):
        with open(f) as fh:
            curricula.append(json.load(fh))
    return curricula


def get_same_subject_chapters(curricula, chapter_id):
    prefix = chapter_id.split("-")[0]
    lines = []
    for cur in curricula:
        p = "math" if cur["subject"] == "math" else "sci"
        if p != prefix:
            continue
        for sem in cur["semesters"]:
            for ch in sem["chapters"]:
                concepts = ", ".join(ch["concepts"])
                lines.append(f"{ch['id']}: {ch['title']} ({concepts})")
    return "\n".join(lines)


def grade_label(grade):
    if grade <= 6:
        return f"초등학교 {grade}학년"
    elif grade <= 9:
        return f"중학교 {grade - 6}학년"
    else:
        return f"고등학교 {grade - 9}학년"


def locale_prompt(grade):
    if grade <= 6:
        return "한국어로 설명하세요. 영어 수학 용어(gcd, lcm, fraction 등)를 사용하지 말고 대한민국 초등 교육과정에서 사용하는 한국어 용어를 사용하세요. 용어를 처음 사용할 때는 괄호 안에 뜻을 함께 설명하세요."
    else:
        return "한국어로 설명하세요. 대한민국 교육과정에서 사용하는 수학/과학 용어를 사용하세요. 용어를 처음 사용할 때는 괄호 안에 뜻을 함께 설명하세요."


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
                return json.loads(match.group())
        except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
            print(f"(retry {attempt + 1}: {type(e).__name__}) ", end="", flush=True)
            if attempt < retries - 1:
                time.sleep(5)
    return None


def generate_lesson_2call(concept, chapter, grade, subject, same_subject, skill_prompt):
    """Generate a lesson in 2 calls: text first, then SVG."""
    lp = locale_prompt(grade)
    gl = grade_label(grade)
    context = f"""
- Country: 대한민국
- Student: {gl}
- Subject: {subject}
- Unit: {chapter['chapter']}단원 - {chapter['title']}
- Concept to teach: {concept}
- All concepts in this unit: {', '.join(chapter['concepts'])}

## Available Curriculum (for prerequisite linking)
{same_subject}"""

    # Call 1: explanation + checkQuestion + prerequisites (no SVG)
    prompt1 = f"""{skill_prompt}

---

## Context for This Lesson

{lp}
{context}

IMPORTANT: Do NOT generate visualSvg in this response. Set visualSvg to null.
Generate only: explanation, checkQuestion, prerequisites.
Return valid JSON only. No other text."""

    result = call_claude(prompt1)
    if not result:
        return None

    # Call 2: SVG only
    explanation_summary = result.get("explanation", "")[:500]
    prompt2 = f"""Create an SVG diagram that visualizes this math/science concept for a Korean student.

## Concept: {concept}
## Lesson summary:
{explanation_summary}

## SVG Rules:
- viewBox="0 0 500 300", xmlns="http://www.w3.org/2000/svg", font-family="sans-serif"
- Colors: primary #4A90D9, secondary #5CB85C, accent #E67E22, background #F8F9FA
- Korean labels, text-anchor="middle" for all text
- No external references
- The SVG should capture the "aha moment".

Return ONLY the SVG code. Start with <svg and end with </svg>. No other text."""

    try:
        svg_proc = subprocess.run(
            ["claude", "-p", prompt2, "--output-format", "text", "--model", "claude-sonnet-4-6"],
            capture_output=True, text=True, timeout=120,
            stdin=subprocess.DEVNULL
        )
        svg_text = svg_proc.stdout.strip()
        svg_text = re.sub(r"^```\w*\s*", "", svg_text)
        svg_text = re.sub(r"\s*```$", "", svg_text)
        svg_match = re.search(r"<svg[\s\S]*</svg>", svg_text)
        result["visualSvg"] = svg_match.group() if svg_match else None
    except subprocess.TimeoutExpired:
        result["visualSvg"] = None

    return result


def find_missing():
    """Find all lesson files with missing concepts."""
    curricula = load_all_curricula()
    missing_map = {}  # {chapter_id: [missing_concepts]}

    for f in sorted(glob.glob(os.path.join(LESSONS_DIR, "*.json"))):
        data = json.load(open(f))
        chapter_id = data["chapterId"]
        generated = [l["concept"] for l in data["lessons"]]

        for cur in curricula:
            for sem in cur["semesters"]:
                for ch in sem["chapters"]:
                    if ch["id"] == chapter_id:
                        missing = [c for c in ch["concepts"] if c not in generated]
                        if missing:
                            missing_map[chapter_id] = {
                                "missing": missing,
                                "chapter": ch,
                                "grade": cur["grade"],
                                "subject": cur["subject"],
                            }
    return missing_map, curricula


def fill_chapter(chapter_id, info, curricula, skill_prompt):
    lesson_path = os.path.join(LESSONS_DIR, f"{chapter_id}.json")
    lesson_data = json.load(open(lesson_path))

    chapter = info["chapter"]
    grade = info["grade"]
    subject = "수학" if info["subject"] == "math" else "과학"
    same_subject = get_same_subject_chapters(curricula, chapter_id)
    lp = locale_prompt(grade)
    gl = grade_label(grade)

    print(f"  {chapter_id}: filling {len(info['missing'])} missing concepts")

    for i, concept in enumerate(info["missing"]):
        print(f"    [{i+1}/{len(info['missing'])}] {concept} ...", end=" ", flush=True)

        result = generate_lesson_2call(concept, chapter, grade, subject, same_subject, skill_prompt)
        if result:
            result["concept"] = concept
            # Insert at correct position
            expected_order = chapter["concepts"]
            idx = expected_order.index(concept)
            # Find insert position in existing lessons
            insert_pos = 0
            for j, existing in enumerate(lesson_data["lessons"]):
                if existing["concept"] in expected_order:
                    existing_idx = expected_order.index(existing["concept"])
                    if existing_idx < idx:
                        insert_pos = j + 1
            lesson_data["lessons"].insert(insert_pos, result)
            print("✓")
        else:
            print("✗")

        time.sleep(2)

    # Save updated file
    lesson_data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    with open(lesson_path, "w") as f:
        json.dump(lesson_data, f, ensure_ascii=False, indent=2)

    total = len(lesson_data["lessons"])
    expected = len(chapter["concepts"])
    print(f"    Saved: {total}/{expected} concepts")


if __name__ == "__main__":
    missing_map, curricula = find_missing()
    skill_prompt = load_skill_prompt()

    if not missing_map:
        print("No missing concepts found!")
        sys.exit(0)

    total_missing = sum(len(v["missing"]) for v in missing_map.values())
    print(f"=== Filling {total_missing} missing concepts across {len(missing_map)} chapters ===\n")

    for chapter_id in sorted(missing_map.keys()):
        fill_chapter(chapter_id, missing_map[chapter_id], curricula, skill_prompt)

    print("\n=== Done ===")
