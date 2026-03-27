import { getProblem, getTopic } from "@/lib/problems";
import { buildBreadcrumb } from "@/lib/breadcrumb";
import { ProblemClient } from "./ProblemClient";
import { DynamicProblemLoader } from "./DynamicProblemLoader";

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ problemId: string }>;
}) {
  const { problemId } = await params;

  // Static problem from JSON
  const problem = getProblem(problemId);
  if (problem) {
    const topic = getTopic(problem.topicId);
    const question = problem.question.replace(/\$[^$]*\$/g, "").replace(/\\\(.*?\\\)/g, "").replace(/\\\[.*?\\\]/gs, "").slice(0, 20) + "...";
    const breadcrumb = buildBreadcrumb({
      chapterId: problem.topicId,
      problemSummary: question,
    });
    return (
      <ProblemClient
        problem={problem}
        topicTitle={topic?.title ?? ""}
        breadcrumb={breadcrumb}
      />
    );
  }

  // AI-generated problem (stored in sessionStorage, loaded client-side)
  return <DynamicProblemLoader problemId={problemId} />;
}
