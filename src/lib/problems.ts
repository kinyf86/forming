import fs from "fs";
import path from "path";
import type { Problem, Topic } from "@/types";
import topics from "@/data/topics.json";
import triangleProblems from "@/data/problems/triangle-angles.json";
import grade5Ch4Problems from "@/data/problems/grade5-math-ch4.json";
import grade5Ch5Problems from "@/data/problems/grade5-math-ch5.json";

const allProblems: Problem[] = [
  ...triangleProblems,
  ...grade5Ch4Problems,
  ...grade5Ch5Problems,
] as Problem[];

const GENERATED_DIR = path.join(process.cwd(), "src/data/generated");

export function getTopics(): Topic[] {
  return topics as Topic[];
}

export function getTopic(topicId: string): Topic | undefined {
  return (topics as Topic[]).find((t) => t.id === topicId);
}

export function getProblem(problemId: string): Problem | undefined {
  // Try static problems first
  const staticProblem = allProblems.find((p) => p.id === problemId);
  if (staticProblem) return staticProblem;

  // Try generated problems
  try {
    const filePath = path.join(GENERATED_DIR, `${problemId}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Problem;
    }
  } catch {
    // ignore
  }

  return undefined;
}

export function getProblemsByTopic(topicId: string): Problem[] {
  return allProblems.filter((p) => p.topicId === topicId);
}
