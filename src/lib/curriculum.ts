import mathCurriculum from "@/data/curriculum/grade6-math.json";
import scienceCurriculum from "@/data/curriculum/grade6-science.json";

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
  mathCurriculum as Curriculum,
  scienceCurriculum as Curriculum,
];

export function getAllChapters(): Chapter[] {
  return curricula.flatMap((c) => c.semesters.flatMap((s) => s.chapters));
}

export function getChapter(chapterId: string): Chapter | undefined {
  return getAllChapters().find((ch) => ch.id === chapterId);
}

export function getChaptersBySubject(subject: "math" | "science"): Semester[] {
  const c = curricula.find((c) => c.subject === subject);
  return c?.semesters ?? [];
}

export function getCurriculum(subject: "math" | "science"): Curriculum | undefined {
  return curricula.find((c) => c.subject === subject);
}

/**
 * AI 프롬프트에 포함할 교육과정 컨텍스트를 생성합니다.
 */
export function buildCurriculumContext(chapterId: string): string {
  const chapter = getChapter(chapterId);
  if (!chapter) return "";

  const subject = chapterId.startsWith("math") ? "수학" : "과학";
  return `## 교육과정 정보
- 과목: ${subject} (초등학교 6학년, 2025년 2015 개정 교육과정)
- 단원: ${chapter.chapter}단원 - ${chapter.title}
- 학습 개념: ${chapter.concepts.join(", ")}`;
}
