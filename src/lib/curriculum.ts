import math3Curriculum from "@/data/curriculum/grade3-math.json";
import math4Curriculum from "@/data/curriculum/grade4-math.json";
import math5Curriculum from "@/data/curriculum/grade5-math.json";
import math6Curriculum from "@/data/curriculum/grade6-math.json";
import math7Curriculum from "@/data/curriculum/grade7-math.json";
import math8Curriculum from "@/data/curriculum/grade8-math.json";
import math9Curriculum from "@/data/curriculum/grade9-math.json";
import math10Curriculum from "@/data/curriculum/grade10-math.json";
import math11Curriculum from "@/data/curriculum/grade11-math.json";
import math12Curriculum from "@/data/curriculum/grade12-math.json";
import science3Curriculum from "@/data/curriculum/grade3-science.json";
import science4Curriculum from "@/data/curriculum/grade4-science.json";
import science5Curriculum from "@/data/curriculum/grade5-science.json";
import science6Curriculum from "@/data/curriculum/grade6-science.json";
import science7Curriculum from "@/data/curriculum/grade7-science.json";
import science8Curriculum from "@/data/curriculum/grade8-science.json";
import science9Curriculum from "@/data/curriculum/grade9-science.json";
import science10Curriculum from "@/data/curriculum/grade10-science.json";
import science11Curriculum from "@/data/curriculum/grade11-science.json";
import science12Curriculum from "@/data/curriculum/grade12-science.json";

export interface Chapter {
  id: string;
  chapter: number;
  title: string;
  concepts: string[];
}

export interface Semester {
  semester: number;
  title: string;
  chapters: Chapter[];
}

export interface Curriculum {
  subject: string;
  grade: number;
  year: number;
  curriculum: string;
  semesters: Semester[];
}

const curricula: Curriculum[] = [
  math3Curriculum as Curriculum,
  math4Curriculum as Curriculum,
  math5Curriculum as Curriculum,
  math6Curriculum as Curriculum,
  math7Curriculum as Curriculum,
  math8Curriculum as Curriculum,
  math9Curriculum as Curriculum,
  math10Curriculum as Curriculum,
  math11Curriculum as Curriculum,
  math12Curriculum as Curriculum,
  science3Curriculum as Curriculum,
  science4Curriculum as Curriculum,
  science5Curriculum as Curriculum,
  science6Curriculum as Curriculum,
  science7Curriculum as Curriculum,
  science8Curriculum as Curriculum,
  science9Curriculum as Curriculum,
  science10Curriculum as Curriculum,
  science11Curriculum as Curriculum,
  science12Curriculum as Curriculum,
];

export function getAllChapters(): Chapter[] {
  return curricula.flatMap((c) => c.semesters.flatMap((s) => s.chapters));
}

export function getChapter(chapterId: string): Chapter | undefined {
  return getAllChapters().find((ch) => ch.id === chapterId);
}

export function getChaptersBySubjectAndGrade(
  subject: "math" | "science",
  grade: number
): Semester[] {
  const c = curricula.find((c) => c.subject === subject && c.grade === grade);
  return c?.semesters ?? [];
}

export function getCurricula(): Curriculum[] {
  return curricula;
}

export function getCurriculum(
  subject: "math" | "science",
  grade?: number
): Curriculum | undefined {
  if (grade) {
    return curricula.find((c) => c.subject === subject && c.grade === grade);
  }
  return curricula.find((c) => c.subject === subject);
}

/**
 * 학년 정보를 chapterId에서 추출
 */
export function getGradeFromChapterId(chapterId: string): number {
  const match = chapterId.match(/math-(\d+)-|sci-(\d+)-/);
  return match ? parseInt(match[1] || match[2]) : 6;
}

export function getGradeLabel(grade: number): string {
  if (grade <= 6) return `초등 ${grade}학년`;
  if (grade <= 9) return `중${grade - 6}`;
  return `고${grade - 9}`;
}

export function getSubjectLabel(chapterId: string, grade: number): string {
  const isMath = chapterId.startsWith("math");
  const subject = isMath ? "수학" : "과학";
  if (grade <= 6) return `초등${grade}${subject}`;
  if (grade <= 9) return `중${grade - 6}${subject}`;
  return `고${grade - 9}${subject}`;
}

/**
 * AI 프롬프트에 포함할 교육과정 컨텍스트를 생성합니다.
 */
export function buildCurriculumContext(chapterId: string): string {
  const chapter = getChapter(chapterId);
  if (!chapter) return "";

  const subject = chapterId.startsWith("math") ? "수학" : "과학";
  const grade = getGradeFromChapterId(chapterId);
  return `## 교육과정 정보
- 과목: ${subject} (초등학교 ${grade}학년, 2025년 2015 개정 교육과정)
- 단원: ${chapter.chapter}단원 - ${chapter.title}
- 학습 개념: ${chapter.concepts.join(", ")}`;
}

/**
 * 같은 과목의 같은 학년 이하 전체 개념 축을 수집합니다.
 * 문제 생성 시 직교 축 조합에 사용합니다.
 */
export function getConceptAxes(chapterId: string): string {
  const grade = getGradeFromChapterId(chapterId);
  const subject = chapterId.startsWith("math") ? "math" : "science";

  const axes: string[] = [];
  let label = "A";

  for (const c of curricula) {
    if (c.subject !== subject || c.grade > grade) continue;
    for (const sem of c.semesters) {
      for (const ch of sem.chapters) {
        const marker = ch.id === chapterId ? " ← [현재 단원]" : "";
        axes.push(`${label}. ${ch.title} (${ch.concepts.join(", ")})${marker}`);
        label = String.fromCharCode(label.charCodeAt(0) + 1);
      }
    }
  }

  return axes.join("\n");
}
