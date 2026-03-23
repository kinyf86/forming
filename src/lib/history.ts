import fs from "fs";
import path from "path";

const HISTORY_DIR = path.join(process.cwd(), "src/data/history");

/**
 * 문제 생성 이력
 */
export interface ProblemGenerationRecord {
  type: "problem_generated";
  id: string;
  timestamp: number;
  problemId: string;
  chapterId: string;
  difficulty: number;
  question: string;
  choices: string[];
  answer: string;
  solution: string;
  concepts: string[];
}

/**
 * 학생 풀이 이력
 */
export interface SubmissionRecord {
  type: "submission";
  id: string;
  timestamp: number;
  problemId: string;
  chapterId: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  passed: boolean;
  canvasImagePath: string | null;
  processAnalysis: string;
  correctSolution: string;
  weaknesses: string[];
  encouragement: string;
}

export type HistoryRecord = ProblemGenerationRecord | SubmissionRecord;

function ensureDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function getFilePath(clientId: string, recordType: string): string {
  return path.join(HISTORY_DIR, `${clientId}_${recordType}.jsonl`);
}

/**
 * 이력 레코드를 JSONL(줄단위 JSON) 형식으로 추가 저장
 */
export function appendRecord(clientId: string, record: HistoryRecord): void {
  ensureDir();
  const filePath = getFilePath(clientId, record.type);
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
}

/**
 * 특정 클라이언트의 이력 조회
 */
export function getRecords(clientId: string, recordType: string): HistoryRecord[] {
  const filePath = getFilePath(clientId, recordType);
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HistoryRecord);
}

/**
 * 특정 클라이언트의 풀이 이력 조회
 */
export function getSubmissions(clientId: string): SubmissionRecord[] {
  return getRecords(clientId, "submission") as SubmissionRecord[];
}

/**
 * 특정 클라이언트의 문제 생성 이력 조회
 */
export function getGenerations(clientId: string): ProblemGenerationRecord[] {
  return getRecords(clientId, "problem_generated") as ProblemGenerationRecord[];
}

/**
 * 특정 클라이언트의 오답 이력만 조회
 */
export function getWrongAnswers(clientId: string): SubmissionRecord[] {
  return getSubmissions(clientId).filter((r) => !r.isCorrect);
}

/**
 * 약점 빈도 집계
 */
export function getWeaknessSummary(clientId: string): Record<string, number> {
  const submissions = getWrongAnswers(clientId);
  const summary: Record<string, number> = {};
  for (const s of submissions) {
    for (const w of s.weaknesses) {
      summary[w] = (summary[w] || 0) + 1;
    }
  }
  return summary;
}
