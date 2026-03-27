import fs from "fs";
import path from "path";
import { sanitizePathSegment, assertWithinBase } from "./sanitize";

export interface LessonContent {
  concept: string;
  explanation: string;
  visualSvg: string | null;
  checkQuestion: {
    question: string;
    options: string[];
    correctIndex: number;
  };
}

export interface ChapterLesson {
  chapterId: string;
  chapterTitle: string;
  generatedAt: string;
  lessons: LessonContent[];
}

const LESSONS_DIR = path.join(process.cwd(), "src/data/lessons");

export function getChapterLesson(chapterId: string): ChapterLesson | null {
  const safeChapterId = sanitizePathSegment(chapterId);
  const filePath = path.join(LESSONS_DIR, `${safeChapterId}.json`);
  assertWithinBase(filePath, LESSONS_DIR);
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ChapterLesson;
  } catch {
    return null;
  }
}

export function saveChapterLesson(lesson: ChapterLesson): void {
  if (!fs.existsSync(LESSONS_DIR)) {
    fs.mkdirSync(LESSONS_DIR, { recursive: true });
  }
  const safeChapterId = sanitizePathSegment(lesson.chapterId);
  const filePath = path.join(LESSONS_DIR, `${safeChapterId}.json`);
  assertWithinBase(filePath, LESSONS_DIR);
  fs.writeFileSync(filePath, JSON.stringify(lesson, null, 2), "utf-8");
}

export function listGeneratedLessons(): string[] {
  if (!fs.existsSync(LESSONS_DIR)) return [];
  return fs
    .readdirSync(LESSONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}
