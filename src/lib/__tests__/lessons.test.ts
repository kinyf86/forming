import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lessons-test-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function importLessons() {
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  fs.mkdirSync(path.join(tmpDir, "src/data/lessons"), { recursive: true });
  vi.resetModules();
  return await import("../lessons");
}

describe("lessons — security", () => {
  it("getChapterLesson throws PathTraversalError for traversal input", async () => {
    const { getChapterLesson } = await importLessons();
    expect(() => getChapterLesson("../../etc/passwd")).toThrow(
      "Invalid path segment"
    );
  });

  it("getChapterLesson throws PathTraversalError for absolute path", async () => {
    const { getChapterLesson } = await importLessons();
    expect(() => getChapterLesson("/etc/passwd")).toThrow("Invalid path segment");
  });

  it("saveChapterLesson throws PathTraversalError for traversal chapterId", async () => {
    const { saveChapterLesson } = await importLessons();
    expect(() =>
      saveChapterLesson({
        chapterId: "../../../etc/evil",
        chapterTitle: "test",
        generatedAt: new Date().toISOString(),
        lessons: [],
      })
    ).toThrow("Invalid path segment");
  });
});

describe("lessons — happy path", () => {
  it("getChapterLesson returns null for nonexistent chapter", async () => {
    const { getChapterLesson } = await importLessons();
    expect(getChapterLesson("nonexistent")).toBeNull();
  });

  it("saveChapterLesson + getChapterLesson roundtrip", async () => {
    const { saveChapterLesson, getChapterLesson } = await importLessons();
    const lesson = {
      chapterId: "math-5-4",
      chapterTitle: "5단원 - 분수의 덧셈",
      generatedAt: new Date().toISOString(),
      lessons: [
        {
          concept: "분수",
          explanation: "분수는...",
          visualSvg: null,
          checkQuestion: {
            question: "1/2 + 1/3 = ?",
            options: ["5/6", "2/5"],
            correctIndex: 0,
          },
        },
      ],
    };
    saveChapterLesson(lesson);
    const retrieved = getChapterLesson("math-5-4");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.chapterId).toBe("math-5-4");
    expect(retrieved!.lessons).toHaveLength(1);
  });

  it("listGeneratedLessons returns saved lesson IDs", async () => {
    const { saveChapterLesson, listGeneratedLessons } = await importLessons();
    saveChapterLesson({
      chapterId: "math-5-4",
      chapterTitle: "test",
      generatedAt: new Date().toISOString(),
      lessons: [],
    });
    saveChapterLesson({
      chapterId: "math-6-1",
      chapterTitle: "test2",
      generatedAt: new Date().toISOString(),
      lessons: [],
    });
    const ids = listGeneratedLessons();
    expect(ids).toContain("math-5-4");
    expect(ids).toContain("math-6-1");
  });
});
