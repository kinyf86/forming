#!/usr/bin/env python3
"""Generate tutor lessons for chapters using any LLM backend.

Replaces the older generate-chapter.py with a backend-agnostic version
that uses scripts/lib/llm.py for unified Claude/Gemma support.

Each lesson is generated in 2 calls:
  1. text (explanation + checkQuestion + prerequisites)
  2. SVG (visualSvg only)

Usage:
    python3 scripts/generate-lessons.py --grade 5
    python3 scripts/generate-lessons.py --grades 7-9 --backend gemma:26b
    python3 scripts/generate-lessons.py --chapter math-5-1-04 --backend claude
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import llm
from lib import curriculum

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS_DIR = os.path.join(ROOT, "src/data/lessons")
os.makedirs(LESSONS_DIR, exist_ok=True)


def generate_lesson_2call(concept, chapter, grade, subject, same_subject, skill, backend):
    """Two-call generation: text body first, then SVG separately."""
    lp = curriculum.locale_prompt(grade)
    gl = curriculum.grade_label(grade)

    context = f"""
- Country: 대한민국
- Student: {gl}
- Subject: {subject}
- Unit: {chapter['chapter']}단원 - {chapter['title']}
- Concept to teach: {concept}
- All concepts in this unit: {', '.join(chapter['concepts'])}

## Available Curriculum (for prerequisite linking)
{same_subject}"""

    # Call 1: text body
    prompt1 = f"""{skill}

---

## Context for This Lesson

{lp}
{context}

IMPORTANT: Set visualSvg to null. Generate only: explanation, checkQuestion, prerequisites.
Return valid JSON only. No other text."""

    response = llm.call_llm(prompt1, backend=backend, timeout=240)
    result = llm.parse_json(response)
    if not result:
        return None

    # Call 2: SVG
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
- Capture the "aha moment" — add understanding text alone cannot.

Return ONLY the SVG code. Start with <svg and end with </svg>. No other text."""

    svg_response = llm.call_llm(prompt2, backend=backend, timeout=120, retries=2)
    if svg_response:
        svg_match = re.search(r"<svg[\s\S]*</svg>", svg_response)
        result["visualSvg"] = svg_match.group() if svg_match else None
    else:
        result["visualSvg"] = None

    return result


def generate_chapter(chapter_info, curricula, skill, backend, force=False):
    chapter = chapter_info["chapter"]
    chapter_id = chapter["id"]
    output_path = os.path.join(LESSONS_DIR, f"{chapter_id}.json")

    if os.path.exists(output_path) and not force:
        print(f"  SKIP {chapter_id} (already exists)")
        return True

    grade = chapter_info["grade"]
    subject = chapter_info["subject_label"]
    same_subject = curriculum.get_same_subject_chapters_text(curricula, chapter_id)

    print(f"  {chapter_id}: {chapter['title']} ({len(chapter['concepts'])} concepts)")

    lessons = []
    for i, concept in enumerate(chapter["concepts"], start=1):
        print(
            f"    [{i}/{len(chapter['concepts'])}] {concept} ...",
            end=" ",
            flush=True,
        )
        t0 = time.time()
        result = generate_lesson_2call(
            concept, chapter, grade, subject, same_subject, skill, backend
        )
        elapsed = time.time() - t0
        if result:
            result["concept"] = concept
            lessons.append(result)
            mark = "✓" if result.get("visualSvg") else "✓ (no svg)"
            print(f"{mark} ({elapsed:.1f}s)")
        else:
            print(f"✗ FAILED ({elapsed:.1f}s)")
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", default="math", choices=["math", "sci"])
    parser.add_argument("--grade", type=int)
    parser.add_argument("--grades", type=str, help="Range like 5-6")
    parser.add_argument("--chapter", type=str, help="Specific chapter ID")
    parser.add_argument("--backend", default="gemma:26b", choices=list(llm.MODEL_MAP.keys()))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    curricula = curriculum.load_all_curricula()
    skill = curriculum.load_skill("generate-lesson")

    if args.chapter:
        ch_obj, cur = curriculum.find_chapter(curricula, args.chapter)
        if not ch_obj:
            print(f"Chapter {args.chapter} not found")
            sys.exit(1)
        chapters = [
            {
                "chapter": ch_obj,
                "grade": cur["grade"],
                "subject": cur["subject"],
                "subject_label": "수학" if cur["subject"] == "math" else "과학",
            }
        ]
    else:
        target_grades = None
        if args.grades:
            start, end = map(int, args.grades.split("-"))
            target_grades = list(range(start, end + 1))
        elif args.grade:
            target_grades = [args.grade]
        chapters = curriculum.get_chapters(
            curricula, subject=args.subject, grades=target_grades
        )

    info = llm.get_backend_info(args.backend)
    print(f"=== Lesson Generation ===")
    print(f"Backend: {info.get('name')}")
    print(f"Chapters: {len(chapters)}")
    print()

    success = 0
    for ci in chapters:
        if generate_chapter(ci, curricula, skill, args.backend, args.force):
            success += 1
    print(f"\n=== Done: {success}/{len(chapters)} ===")


if __name__ == "__main__":
    main()
