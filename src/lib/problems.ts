import fs from "fs";
import path from "path";
import { sanitizePathSegment, assertWithinBase } from "./sanitize";
import type { Problem, Topic } from "@/types";
import topics from "@/data/topics.json";
import triangleProblems from "@/data/problems/triangle-angles.json";
import grade5Ch4Problems from "@/data/problems/grade5-math-ch4.json";
import grade5Ch5Problems from "@/data/problems/grade5-math-ch5.json";
import {
  ProblemV2Schema,
  isProblemV2,
  v2ToLegacyProblem,
  type ProblemV2,
} from "./schemas/problem";

const allStaticProblems: Problem[] = [
  ...triangleProblems,
  ...grade5Ch4Problems,
  ...grade5Ch5Problems,
] as Problem[];

const CURATED_DIR = path.join(process.cwd(), "src/data/problems/curated");
const RUNTIME_CACHE_DIR = path.join(process.cwd(), "src/data/generated");

export function getTopics(): Topic[] {
  return topics as Topic[];
}

export function getTopic(topicId: string): Topic | undefined {
  return (topics as Topic[]).find((t) => t.id === topicId);
}

function readProblemFromDir(dir: string, problemId: string): Problem | undefined {
  const safeId = sanitizePathSegment(problemId);
  const filePath = path.join(dir, `${safeId}.json`);
  assertWithinBase(filePath, dir);
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (isProblemV2(raw)) {
      const parsed = ProblemV2Schema.parse(raw);
      if (parsed.validation.status === "REJECT") return undefined;
      return v2ToLegacyProblem(parsed);
    }
    return raw as Problem;
  } catch {
    return undefined;
  }
}

export function getProblem(problemId: string): Problem | undefined {
  const staticProblem = allStaticProblems.find((p) => p.id === problemId);
  if (staticProblem) return staticProblem;
  return (
    readProblemFromDir(CURATED_DIR, problemId) ??
    readProblemFromDir(RUNTIME_CACHE_DIR, problemId)
  );
}

export function getProblemsByTopic(topicId: string): Problem[] {
  return allStaticProblems.filter((p) => p.topicId === topicId);
}

function listProblemsInDir(dir: string): Problem[] {
  if (!fs.existsSync(dir)) return [];
  const out: Problem[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (isProblemV2(raw)) {
        const parsed = ProblemV2Schema.parse(raw);
        if (parsed.validation.status === "REJECT") continue;
        out.push(v2ToLegacyProblem(parsed));
      } else if (raw && typeof raw === "object" && "id" in raw && "topicId" in raw) {
        out.push(raw as Problem);
      }
    } catch {
      // skip malformed
    }
  }
  return out;
}

export function listAllGeneratedProblems(): Problem[] {
  return [...listProblemsInDir(CURATED_DIR), ...listProblemsInDir(RUNTIME_CACHE_DIR)];
}

export function getCuratedDir(): string {
  return CURATED_DIR;
}

export function getRuntimeCacheDir(): string {
  return RUNTIME_CACHE_DIR;
}

export function readProblemV2Raw(problemId: string): ProblemV2 | undefined {
  const safeId = sanitizePathSegment(problemId);
  for (const dir of [CURATED_DIR, RUNTIME_CACHE_DIR]) {
    const filePath = path.join(dir, `${safeId}.json`);
    assertWithinBase(filePath, dir);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (isProblemV2(raw)) return ProblemV2Schema.parse(raw);
    } catch {
      // skip
    }
  }
  return undefined;
}

export interface ProblemFileLocation {
  path: string;
  isV2: boolean;
}

export function findProblemFile(problemId: string): ProblemFileLocation | undefined {
  const safeId = sanitizePathSegment(problemId);
  for (const dir of [CURATED_DIR, RUNTIME_CACHE_DIR]) {
    const filePath = path.join(dir, `${safeId}.json`);
    assertWithinBase(filePath, dir);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return { path: filePath, isV2: isProblemV2(raw) };
    } catch {
      // skip
    }
  }
  return undefined;
}
