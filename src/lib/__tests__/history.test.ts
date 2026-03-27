import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// We need to mock the HISTORY_DIR to use a temp directory
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "history-test-"));
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Dynamic import with mocked process.cwd to redirect HISTORY_DIR
async function importHistory() {
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  // Create the expected directory structure
  fs.mkdirSync(path.join(tmpDir, "src/data/history"), { recursive: true });

  // Clear module cache and re-import
  vi.resetModules();
  return await import("../history");
}

describe("history — security", () => {
  it("appendRecord throws PathTraversalError for traversal clientId", async () => {
    const { appendRecord } = await importHistory();
    const record = {
      type: "submission" as const,
      id: "test-1",
      timestamp: Date.now(),
      problemId: "p1",
      chapterId: "ch1",
      question: "test",
      studentAnswer: "a",
      correctAnswer: "b",
      isCorrect: false,
      passed: false,
      canvasImagePath: null,
      processAnalysis: "",
      correctSolution: "",
      weaknesses: [],
      encouragement: "",
    };
    expect(() => appendRecord("../../etc/passwd", record)).toThrow(
      "Invalid path segment"
    );
  });

  it("getRecords throws PathTraversalError for traversal clientId", async () => {
    const { getRecords } = await importHistory();
    expect(() => getRecords("../secret", "submission")).toThrow(
      "Invalid path segment"
    );
  });

  it("getSubmissions throws PathTraversalError for traversal clientId", async () => {
    const { getSubmissions } = await importHistory();
    expect(() => getSubmissions("/etc/passwd")).toThrow("Invalid path segment");
  });
});

describe("history — happy path", () => {
  const makeSubmission = (
    id: string,
    isCorrect: boolean,
    weaknesses: string[] = []
  ) => ({
    type: "submission" as const,
    id,
    timestamp: Date.now(),
    problemId: `prob-${id}`,
    chapterId: "math-5-4",
    question: "What is 1+1?",
    studentAnswer: "2",
    correctAnswer: "2",
    isCorrect,
    passed: false,
    canvasImagePath: null,
    processAnalysis: "Good",
    correctSolution: "1+1=2",
    weaknesses,
    encouragement: "Great!",
  });

  const makeGeneration = (id: string) => ({
    type: "problem_generated" as const,
    id,
    timestamp: Date.now(),
    problemId: `prob-${id}`,
    chapterId: "math-5-4",
    difficulty: 1,
    question: "What is 1+1?",
    choices: ["1", "2", "3"],
    answer: "2",
    solution: "1+1=2",
    concepts: ["addition"],
  });

  it("appendRecord writes and getRecords reads JSONL correctly", async () => {
    const { appendRecord, getRecords } = await importHistory();
    const record = makeSubmission("s1", true);
    appendRecord("student-1", record);
    const records = getRecords("student-1", "submission");
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("s1");
  });

  it("getRecords returns empty array for nonexistent client", async () => {
    const { getRecords } = await importHistory();
    expect(getRecords("nonexistent", "submission")).toEqual([]);
  });

  it("getSubmissions returns submission records", async () => {
    const { appendRecord, getSubmissions } = await importHistory();
    appendRecord("student-2", makeSubmission("s1", true));
    appendRecord("student-2", makeSubmission("s2", false));
    const subs = getSubmissions("student-2");
    expect(subs).toHaveLength(2);
  });

  it("getGenerations returns generation records", async () => {
    const { appendRecord, getGenerations } = await importHistory();
    appendRecord("student-3", makeGeneration("g1"));
    const gens = getGenerations("student-3");
    expect(gens).toHaveLength(1);
    expect(gens[0].id).toBe("g1");
  });

  it("getWrongAnswers filters incorrect submissions", async () => {
    const { appendRecord, getWrongAnswers } = await importHistory();
    appendRecord("student-4", makeSubmission("s1", true));
    appendRecord("student-4", makeSubmission("s2", false));
    appendRecord("student-4", makeSubmission("s3", false));
    const wrong = getWrongAnswers("student-4");
    expect(wrong).toHaveLength(2);
    expect(wrong.every((r) => !r.isCorrect)).toBe(true);
  });

  it("getWeaknessSummary aggregates weakness counts", async () => {
    const { appendRecord, getWeaknessSummary } = await importHistory();
    appendRecord(
      "student-5",
      makeSubmission("s1", false, ["fractions", "division"])
    );
    appendRecord("student-5", makeSubmission("s2", false, ["fractions"]));
    const summary = getWeaknessSummary("student-5");
    expect(summary).toEqual({ fractions: 2, division: 1 });
  });
});
