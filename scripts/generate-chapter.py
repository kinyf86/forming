#!/usr/bin/env python3
"""Generate tutor lessons for a single chapter or grade range via Claude CLI."""

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

os.makedirs(LESSONS_DIR, exist_ok=True)


def load_skill_prompt():
    with open(SKILL_PATH) as f:
        return f.read()


def load_all_curricula():
    curricula = []
    for f in sorted(glob.glob(os.path.join(CURRICULUM_DIR, "*.json"))):
        with open(f) as fh:
            curricula.append(json.load(fh))
    return curricula


def find_chapter(curricula, chapter_id):
    for cur in curricula:
        prefix = "math" if cur["subject"] == "math" else "sci"
        for sem in cur["semesters"]:
            for ch in sem["chapters"]:
                if ch["id"] == chapter_id:
                    return ch, cur
    return None, None


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
            # Strip markdown fences
            text = re.sub(r"^```json?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            # Find JSON object
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

    # Call 2: SVG only, referencing the explanation
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
- The SVG should capture the "aha moment" — add understanding that text alone cannot.
- Prefer: before/after comparison, step-by-step transformation, pattern tables

Return ONLY the SVG code. Start with <svg and end with </svg>. No other text."""

    svg_result = call_claude(prompt2, timeout=120)
    if svg_result and isinstance(svg_result, dict):
        # If it returned JSON with svg field
        result["visualSvg"] = svg_result.get("visualSvg") or svg_result.get("svg")
    else:
        # Try to extract raw SVG from text response
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
            if svg_match:
                result["visualSvg"] = svg_match.group()
            else:
                result["visualSvg"] = None
        except subprocess.TimeoutExpired:
            result["visualSvg"] = None

    return result


def generate_chapter(chapter_id, curricula, skill_prompt, force=False):
    output_path = os.path.join(LESSONS_DIR, f"{chapter_id}.json")
    if os.path.exists(output_path) and not force:
        print(f"  SKIP {chapter_id} (already exists)")
        return True

    chapter, cur = find_chapter(curricula, chapter_id)
    if not chapter:
        print(f"  ERROR: {chapter_id} not found")
        return False

    grade = cur["grade"]
    subject = "수학" if cur["subject"] == "math" else "과학"
    same_subject = get_same_subject_chapters(curricula, chapter_id)

    print(f"  {chapter_id}: {chapter['title']} ({len(chapter['concepts'])} concepts)")

    lessons = []
    for i, concept in enumerate(chapter["concepts"]):
        print(f"    [{i + 1}/{len(chapter['concepts'])}] {concept} ...", end=" ", flush=True)

        result = generate_lesson_2call(concept, chapter, grade, subject, same_subject, skill_prompt)
        if result:
            result["concept"] = concept
            lessons.append(result)
            has_svg = "✓" if result.get("visualSvg") else "✓ (no svg)"
            print(has_svg)
        else:
            print("✗ FAILED")

        time.sleep(2)

    chapter_lesson = {
        "chapterId": chapter_id,
        "chapterTitle": f"{chapter['chapter']}단원 - {chapter['title']}",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "lessons": lessons,
    }

    with open(output_path, "w") as f:
        json.dump(chapter_lesson, f, ensure_ascii=False, indent=2)

    print(f"    Saved: {output_path} ({len(lessons)}/{len(chapter['concepts'])} concepts)")
    return True


def get_chapter_ids(curricula, subject_filter=None, grade_filter=None):
    ids = []
    for cur in curricula:
        prefix = "math" if cur["subject"] == "math" else "sci"
        if subject_filter and prefix != subject_filter:
            continue
        if grade_filter and cur["grade"] != grade_filter:
            continue
        for sem in cur["semesters"]:
            for ch in sem["chapters"]:
                ids.append(ch["id"])
    return ids


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", choices=["math", "sci"], help="Filter by subject")
    parser.add_argument("--grade", type=int, help="Filter by grade")
    parser.add_argument("--chapter", help="Generate a specific chapter ID")
    parser.add_argument("--force", action="store_true", help="Regenerate even if exists")
    args = parser.parse_args()

    curricula = load_all_curricula()
    skill_prompt = load_skill_prompt()

    if args.chapter:
        chapter_ids = [args.chapter]
    else:
        chapter_ids = get_chapter_ids(curricula, args.subject, args.grade)

    print(f"=== Generating {len(chapter_ids)} chapters ===\n")

    success = 0
    for cid in chapter_ids:
        if generate_chapter(cid, curricula, skill_prompt, args.force):
            success += 1

    print(f"\n=== Done: {success}/{len(chapter_ids)} ===")
