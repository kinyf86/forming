"use client";

import { useEffect, useMemo, useState } from "react";
import type { Problem } from "@/types";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { ProblemClient } from "./ProblemClient";

function buildClientBreadcrumb(problem: Problem): BreadcrumbItem[] {
  const ismath = problem.topicId.startsWith("math");
  const subjectLabel = ismath ? "초등6수학" : "초등6과학";
  const question = problem.question.slice(0, 20) + "...";

  return [
    { label: "홈", href: "/" },
    { label: subjectLabel, href: "/" },
    { label: problem.topicId, href: `/chapter/${problem.topicId}` },
    { label: question },
  ];
}

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
    () => (problem ? buildClientBreadcrumb(problem) : []),
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
      topicTitle={problem.topicId}
      breadcrumb={breadcrumb}
    />
  );
}
