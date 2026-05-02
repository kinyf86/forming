import fs from "fs";
import path from "path";
import { sanitizePathSegment, assertWithinBase } from "./sanitize";

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

/**
 * 튜터 대화 이력
 */
export interface TutorRecord {
  type: "tutor_turn";
  id: string;
  timestamp: number;
  sessionId: string;
  userMessage: string;
  assistantResponse: string;
  action: "push" | "pop" | "stay" | "complete";
  concept: string;
  current_concept: string;
  prerequisite_stack: string[];
}

/**
 * 통합 대화 턴 — 학생(user)과 AI(assistant)의 발화를 같은 스키마로 기록.
 * sessionType으로 튜터/문제피드백/피드백챗 구분. sessionId로 한 세션을 묶음.
 */
export type SessionType = "tutor" | "problem_feedback" | "feedback_chat";

export interface ConversationAttachment {
  type: "canvas_image";
  path: string | null;
}

export interface ConversationTurnRecord {
  type: "conversation_turn";
  id: string;
  timestamp: number;
  sessionId: string;
  sessionType: SessionType;
  role: "user" | "assistant";
  text: string;
  contextRef: {
    chapterId?: string;
    problemId?: string;
    concept?: string;
  };
  attachments: ConversationAttachment[];
  meta?: {
    action?: "push" | "pop" | "stay" | "complete";
    concept?: string;
    prerequisite_stack?: string[];
    confirmed_concepts?: string[];
    isCorrect?: boolean;
    passed?: boolean;
    weaknesses?: string[];
  };
}

/**
 * Claude CLI 호출 원문 기록. 프롬프트·응답·지연·토큰·오류를 그대로 보관.
 * sessionId로 ConversationTurnRecord와 시간 기반 교차 조회.
 */
export interface AICallRecord {
  type: "ai_call";
  id: string;
  timestamp: number;
  sessionId: string | null;
  endpoint: string;
  model: string;
  prompt: string;
  response: string;
  latencyMs: number;
  tokenUsage: { input: number; output: number } | null;
  totalCostUsd: number | null;
  hasImage: boolean;
  error: string | null;
}

export type HistoryRecord =
  | ProblemGenerationRecord
  | SubmissionRecord
  | TutorRecord
  | ConversationTurnRecord
  | AICallRecord;

function ensureDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function getFilePath(clientId: string, recordType: string): string {
  const safeClientId = sanitizePathSegment(clientId);
  const filePath = path.join(HISTORY_DIR, `${safeClientId}_${recordType}.jsonl`);
  assertWithinBase(filePath, HISTORY_DIR);
  return filePath;
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
 * 튜터 대화 이력 저장
 */
export function appendTutorRecord(clientId: string, record: TutorRecord): void {
  try {
    ensureDir();
    const filePath = getFilePath(clientId, "tutor_turn");
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // Logging failure should not block tutor response
  }
}

/**
 * 튜터 대화 이력 조회
 */
export function getTutorHistory(clientId: string): TutorRecord[] {
  return getRecords(clientId, "tutor_turn") as TutorRecord[];
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

/**
 * 대화 턴 저장 — 실패는 삼켜서 본 응답 흐름을 막지 않음.
 */
export function appendConversationTurn(
  clientId: string,
  record: ConversationTurnRecord
): void {
  try {
    ensureDir();
    const filePath = getFilePath(clientId, "conversation");
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // non-blocking
  }
}

/**
 * AI 호출 로그 저장 — 실패는 삼켜서 실제 API 응답을 막지 않음.
 */
export function appendAICall(clientId: string, record: AICallRecord): void {
  try {
    ensureDir();
    const filePath = getFilePath(clientId, "ai_call");
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // non-blocking
  }
}

/**
 * 세션 하나의 전체 대화 턴 반환 (시간 오름차순).
 */
export function getConversation(
  clientId: string,
  sessionId: string
): ConversationTurnRecord[] {
  const filePath = getFilePath(clientId, "conversation");
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ConversationTurnRecord)
    .filter((r) => r.sessionId === sessionId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 클라이언트의 세션 목록 — 각 세션의 시작/끝 시각, 타입, 턴 수 요약.
 */
export interface SessionSummary {
  sessionId: string;
  sessionType: SessionType;
  firstTimestamp: number;
  lastTimestamp: number;
  turnCount: number;
  contextRef: ConversationTurnRecord["contextRef"];
}

export function listSessions(
  clientId: string,
  limit = 50
): SessionSummary[] {
  const filePath = getFilePath(clientId, "conversation");
  if (!fs.existsSync(filePath)) return [];

  const records = fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ConversationTurnRecord);

  const summaries = new Map<string, SessionSummary>();
  for (const r of records) {
    const existing = summaries.get(r.sessionId);
    if (!existing) {
      summaries.set(r.sessionId, {
        sessionId: r.sessionId,
        sessionType: r.sessionType,
        firstTimestamp: r.timestamp,
        lastTimestamp: r.timestamp,
        turnCount: 1,
        contextRef: r.contextRef,
      });
    } else {
      existing.lastTimestamp = Math.max(existing.lastTimestamp, r.timestamp);
      existing.firstTimestamp = Math.min(existing.firstTimestamp, r.timestamp);
      existing.turnCount += 1;
      if (!existing.contextRef.chapterId && r.contextRef.chapterId) {
        existing.contextRef = { ...existing.contextRef, ...r.contextRef };
      }
    }
  }

  return Array.from(summaries.values())
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp)
    .slice(0, limit);
}

/**
 * 세션에 속한 AI 호출 기록 조회 (프롬프트·응답 원문 확인용).
 */
export function getAICalls(
  clientId: string,
  sessionId?: string
): AICallRecord[] {
  const filePath = getFilePath(clientId, "ai_call");
  if (!fs.existsSync(filePath)) return [];

  const all = fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AICallRecord);

  return sessionId
    ? all.filter((r) => r.sessionId === sessionId).sort((a, b) => a.timestamp - b.timestamp)
    : all.sort((a, b) => a.timestamp - b.timestamp);
}
