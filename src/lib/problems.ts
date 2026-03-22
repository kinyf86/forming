import type { Problem, Topic } from "@/types";
import topics from "@/data/topics.json";
import triangleProblems from "@/data/problems/triangle-angles.json";

const allProblems: Problem[] = [...triangleProblems] as Problem[];

export function getTopics(): Topic[] {
  return topics as Topic[];
}

export function getTopic(topicId: string): Topic | undefined {
  return (topics as Topic[]).find((t) => t.id === topicId);
}

export function getProblem(problemId: string): Problem | undefined {
  return allProblems.find((p) => p.id === problemId);
}

export function getProblemsByTopic(topicId: string): Problem[] {
  return allProblems.filter((p) => p.topicId === topicId);
}
