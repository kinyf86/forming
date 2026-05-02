#!/usr/bin/env python3
"""Fill in missing concepts in existing lesson files using any LLM backend.

Scans all lesson files in src/data/lessons, identifies concepts from the
curriculum that haven't been generated yet, and fills them in.

Usage:
    python3 scripts/fill-missing-lessons.py --backend gemma:26b
    python3 scripts/fill-missing-lessons.py --backend claude
"""

import argparse
import glob
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


def find_missing(curricula):
    missing_map = {}
    for f in sorted(glob.glob(os.path.join(LESSONS_DIR, "*.json"))):
        data = json.load(open(f))
        chapter_id = data["chapterId"]
        generated = [l["concept"] for l in data["lessons"]]
        ch_obj, cur = curriculum.find_chapter(curricula, chapter_id)
        if not ch_obj:
            continue
        missing = [c for c in ch_obj["concepts"] if c not in generated]
        if missing:
            missing_map[chapter_id] = {
                "missing": missing,
                "chapter": ch_obj,
                "grade": cur["grade"],
                "subject": cur["subject"],
            }
    return missing_map


def generate_lesson_2call(concept, chapter, grade, subject, same_subject, skill, backend):
    lp = curriculum.locale_prompt(grade)
    gl = curriculum.grade_label(grade)

    prompt1 = f"""{skill}

---

## Context for This Lesson

{lp}

- Country: 대한민국
- Student: {gl}
- Subject: {subject}
- Unit: {chapter['chapter']}단원 - {chapter['title']}
- Concept to teach: {concept}
- All concepts in this unit: {', '.join(chapter['concepts'])}

## Available Curriculum (for prerequisite linking)
{same_subject}

IMPORTANT: Set visualSvg to null. Generate only: explanation, checkQuestion, prerequisites.
Return valid JSON only. No other text."""

    response = llm.call_llm(prompt1, backend=backend, timeout=240)
    result = llm.parse_json(response)
    if not result:
        return None

    explanation_summary = result.get("explanation", "")[:500]
    prompt2 = f"""Create an SVG diagram that visualizes this math/science concept for a Korean student.

## Concept: {concept}
## Lesson summary:
{explanation_summary}

## SVG Rules:
- viewBox="0 0 500 300", xmlns="http://www.w3.org/2000/svg", font-family="sans-serif"
- Colors: primary #4A90D9, secondary #5CB85C, accent #E67E22, background #F8F9FA
- Korean labels, text-anchor="middle"
- No external references

Return ONLY the SVG code. Start with <svg and end with </svg>."""

    svg_response = llm.call_llm(prompt2, backend=backend, timeout=120)
    if svg_response:
        m = re.search(r"<svg[\s\S]*</svg>", svg_response)
        result["visualSvg"] = m.group() if m else None
    else:
        result["visualSvg"] = None

    return result


def fill_chapter(chapter_id, info, curricula, skill, backend):
    lesson_path = os.path.join(LESSONS_DIR, f"{chapter_id}.json")
    lesson_data = json.load(open(lesson_path))

    chapter = info["chapter"]
    grade = info["grade"]
    subject = "수학" if info["subject"] == "math" else "과학"
    same_subject = curriculum.get_same_subject_chapters_text(curricula, chapter_id)

    print(f"  {chapter_id}: filling {len(info['missing'])} missing")

    for i, concept in enumerate(info["missing"], start=1):
        print(f"    [{i}/{len(info['missing'])}] {concept} ...", end=" ", flush=True)
        t0 = time.time()
        result = generate_lesson_2call(
            concept, chapter, grade, subject, same_subject, skill, backend
        )
        elapsed = time.time() - t0
        if result:
            result["concept"] = concept
            expected_order = chapter["concepts"]
            idx = expected_order.index(concept)
            insert_pos = 0
            for j, existing in enumerate(lesson_data["lessons"]):
                if existing["concept"] in expected_order:
                    if expected_order.index(existing["concept"]) < idx:
                        insert_pos = j + 1
            lesson_data["lessons"].insert(insert_pos, result)
            print(f"✓ ({elapsed:.1f}s)")
        else:
            print(f"✗ ({elapsed:.1f}s)")
        time.sleep(2)

    lesson_data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    with open(lesson_path, "w") as f:
        json.dump(lesson_data, f, ensure_ascii=False, indent=2)
    print(
        f"    Saved: {len(lesson_data['lessons'])}/{len(chapter['concepts'])} concepts"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--backend", default="gemma:26b", choices=list(llm.MODEL_MAP.keys())
    )
    args = parser.parse_args()

    curricula = curriculum.load_all_curricula()
    skill = curriculum.load_skill("generate-lesson")
    missing_map = find_missing(curricula)

    if not missing_map:
        print("No missing concepts!")
        return

    total = sum(len(v["missing"]) for v in missing_map.values())
    info = llm.get_backend_info(args.backend)
    print(f"=== Filling {total} concepts across {len(missing_map)} chapters ===")
    print(f"Backend: {info.get('name')}\n")

    for cid in sorted(missing_map.keys()):
        fill_chapter(cid, missing_map[cid], curricula, skill, args.backend)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
