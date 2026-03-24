import math6Curriculum from "@/data/curriculum/grade6-math.json";
import science6Curriculum from "@/data/curriculum/grade6-science.json";
import math5Curriculum from "@/data/curriculum/grade5-math.json";

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
  math5Curriculum as Curriculum,
  math6Curriculum as Curriculum,
  science6Curriculum as Curriculum,
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
