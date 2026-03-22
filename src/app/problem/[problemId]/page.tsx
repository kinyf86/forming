import { notFound } from "next/navigation";
import { getProblem, getTopic } from "@/lib/problems";
import { ProblemClient } from "./ProblemClient";

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ problemId: string }>;
}) {
  const { problemId } = await params;
  const problem = getProblem(problemId);
  if (!problem) notFound();

  const topic = getTopic(problem.topicId);

  return (
    <ProblemClient
      problem={problem}
      topicTitle={topic?.title ?? ""}
    />
  );
}
