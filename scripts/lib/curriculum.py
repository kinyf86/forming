"""Shared curriculum loading and context building.

Used by all generation scripts so that prompts get consistent context
regardless of which LLM backend is in use.
"""

import glob
import json
import os
from typing import Optional

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CURRICULUM_DIR = os.path.join(ROOT, "src/data/curriculum")
LESSONS_DIR = os.path.join(ROOT, "src/data/lessons")
PROMPTS_DIR = os.path.join(ROOT, "src/data/prompts")


def load_skill(name: str) -> str:
    """Load a skill prompt by filename (without extension).

    Example: load_skill("generate-lesson") -> contents of generate-lesson.md
    """
    path = os.path.join(PROMPTS_DIR, f"{name}.md")
    with open(path) as f:
        return f.read()


def load_all_curricula() -> list:
    curricula = []
    for f in sorted(glob.glob(os.path.join(CURRICULUM_DIR, "*.json"))):
        curricula.append(json.load(open(f)))
    return curricula


def find_chapter(curricula: list, chapter_id: str):
    for cur in curricula:
        for sem in cur["semesters"]:
            for ch in sem["chapters"]:
                if ch["id"] == chapter_id:
                    return ch, cur
    return None, None


def get_chapters(
    curricula: list,
    subject: Optional[str] = None,
    grade: Optional[int] = None,
    grades: Optional[list] = None,
) -> list:
    """Return chapters matching filters. subject is 'math' or 'sci'."""
    result = []
    for cur in curricula:
        cur_subject = "math" if cur["subject"] == "math" else "sci"
        if subject and cur_subject != subject:
            continue
        if grade and cur["grade"] != grade:
            continue
        if grades and cur["grade"] not in grades:
            continue
        for sem in cur["semesters"]:
            for ch in sem["chapters"]:
                result.append(
                    {
                        "chapter": ch,
                        "grade": cur["grade"],
                        "subject": cur["subject"],
                        "subject_label": "수학" if cur["subject"] == "math" else "과학",
                    }
                )
    return result


def get_same_subject_chapters_text(curricula: list, chapter_id: str) -> str:
    """Return a formatted string of all chapters in the same subject.

    Used as context for prerequisite mapping.
    """
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


def grade_label(grade: int) -> str:
    if grade <= 6:
        return f"초등학교 {grade}학년"
    elif grade <= 9:
        return f"중학교 {grade - 6}학년"
    else:
        return f"고등학교 {grade - 9}학년"


def locale_prompt(grade: int) -> str:
    if grade <= 6:
        return (
            "한국어로 설명하세요. 영어 수학 용어(gcd, lcm, fraction 등)를 사용하지 말고 "
            "대한민국 초등 교육과정에서 사용하는 한국어 용어를 사용하세요. "
            "용어를 처음 사용할 때는 괄호 안에 뜻을 함께 설명하세요."
        )
    else:
        return (
            "한국어로 설명하세요. 대한민국 교육과정에서 사용하는 수학/과학 용어를 사용하세요. "
            "용어를 처음 사용할 때는 괄호 안에 뜻을 함께 설명하세요."
        )


def load_lesson_summary(chapter_id: str, max_chars_per_concept: int = 300) -> str:
    """Load short summaries of each concept's explanation from a chapter's lesson file.

    Used as context for problem generation so problems align with the lesson content.
    """
    path = os.path.join(LESSONS_DIR, f"{chapter_id}.json")
    if not os.path.exists(path):
        return ""
    data = json.load(open(path))
    lines = []
    for l in data.get("lessons", []):
        concept = l.get("concept", "")
        explanation = l.get("explanation", "")[:max_chars_per_concept]
        lines.append(f"- {concept}: {explanation}...")
    return "\n".join(lines)
