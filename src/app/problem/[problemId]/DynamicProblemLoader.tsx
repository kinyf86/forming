"use client";

import { useEffect, useMemo, useState } from "react";
import type { Problem } from "@/types";
import { buildBreadcrumb } from "@/lib/breadcrumb";
import { getChapter } from "@/lib/curriculum";
import { ProblemClient } from "./ProblemClient";

export function DynamicProblemLoader({ problemId }: { problemId: string }) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(`problem-${problemId}`);
    if (stored) {
      setProblem(JSON.parse(stored));
    } else {
      setNotFound(true);
    }
  }, [problemId]);

  const breadcrumb = useMemo(
    () =>
      problem
        ? buildBreadcrumb({
            chapterId: problem.topicId,
            problemSummary: problem.question.replace(/\$[^$]*\$/g, "").replace(/\\\(.*?\\\)/g, "").replace(/\\\[[^]*?\\\]/g, "").slice(0, 20) + "...",
          })
        : [],
    [problem]
  );

  if (notFound) {
    return (
      <div className="py-20 text-center text-gray-500">
        문제를 찾을 수 없습니다.
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="py-20 text-center text-gray-500">
        문제를 불러오는 중...
      </div>
    );
  }

  return (
    <ProblemClient
      problem={problem}
      topicTitle={getChapter(problem.topicId)?.title ?? problem.topicId}
      breadcrumb={breadcrumb}
    />
  );
}
