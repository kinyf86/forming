"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Problem, AnalysisResult } from "@/types";
import { getClientId } from "@/lib/client-id";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { TheoryContent } from "@/components/theory/TheoryContent";
import { DiagramSvg } from "@/components/ui/DiagramSvg";
import MultimodalChat from "@/components/chat/MultimodalChat";

interface StoredResult {
  problem: Problem;
  analysis: AnalysisResult;
  submission: {
    canvasText: string;
    finalAnswer: string;
    passed: boolean;
  };
}

function buildResultBreadcrumb(problem: Problem): BreadcrumbItem[] {
  const isMath = problem.topicId.startsWith("math");
  const subjectLabel = isMath ? "초등6수학" : problem.topicId.startsWith("sci") ? "초등6과학" : "학습";
  const question = problem.question.slice(0, 20) + "...";

  const chapterHref =
    problem.topicId.startsWith("math-") || problem.topicId.startsWith("sci-")
      ? `/chapter/${problem.topicId}`
      : `/theory/${problem.topicId}`;

  return [
    { label: "홈", href: "/" },
    { label: subjectLabel, href: "/" },
    { label: problem.topicId.startsWith("math-") || problem.topicId.startsWith("sci-") ? problem.topicId : problem.topicId, href: chapterHref },
    { label: question },
  ];
}

export default function ResultPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<StoredResult | null>(null);
  const [generatingNew, setGeneratingNew] = useState(false);

  useEffect(() => {
    const submissionId = params.submissionId as string;
    const stored = sessionStorage.getItem(submissionId);
    if (stored) {
      setData(JSON.parse(stored));
    }
  }, [params.submissionId]);

  const breadcrumb = useMemo(
    () => (data ? buildResultBreadcrumb(data.problem) : []),
    [data]
  );

  const [loadingRecommended, setLoadingRecommended] = useState<string | null>(null);

  const handleRecommendedProblem = async (np: { question: string; difficulty: number; targetWeakness: string }) => {
    setLoadingRecommended(np.question);
    try {
      const res = await fetch("/api/complete-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: np.question,
          topicId: data!.problem.topicId,
          difficulty: np.difficulty,
          targetWeakness: np.targetWeakness,
          clientId: getClientId(),
        }),
      });
      if (!res.ok) throw new Error();
      const completedProblem = await res.json();
      sessionStorage.setItem(`problem-${completedProblem.id}`, JSON.stringify(completedProblem));
      router.push(`/problem/${completedProblem.id}`);
    } catch {
      setLoadingRecommended(null);
    }
  };

  const handleSameChapterNewProblem = async () => {
    if (!data) return;
    setGeneratingNew(true);
    try {
      const res = await fetch("/api/generate-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: data.problem.topicId, clientId: getClientId() }),
      });
      if (!res.ok) throw new Error();
      const problem = await res.json();
      sessionStorage.setItem(`problem-${problem.id}`, JSON.stringify(problem));
      router.push(`/problem/${problem.id}`);
    } catch {
      // fallback to chapter page
      router.push(`/chapter/${data.problem.topicId}`);
    } finally {
      setGeneratingNew(false);
    }
  };

  if (!data) {
    return (
      <div className="py-20 text-center text-gray-500">
        결과를 불러오는 중...
      </div>
    );
  }

  const { problem, analysis } = data;

  const chapterHref =
    problem.topicId.startsWith("math-") || problem.topicId.startsWith("sci-")
      ? `/chapter/${problem.topicId}`
      : `/theory/${problem.topicId}`;

  return (
    <div>
      <Breadcrumb items={breadcrumb} />

      {/* Frame#7: 결과 영역 */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              analysis.isCorrect
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {analysis.isCorrect ? "정답" : "오답"}
          </span>
          <h2 className="text-lg font-semibold">풀이 분석</h2>
        </div>

        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <TheoryContent content={analysis.processAnalysis} />
        </div>

        <h3 className="mb-3 font-semibold">정답 풀이</h3>
        <div className="rounded-lg bg-blue-50 p-4">
          <TheoryContent content={analysis.correctSolution} />
          {problem.solutionDiagram && (
            <DiagramSvg svg={problem.solutionDiagram} animated />
          )}
        </div>

        {analysis.encouragement && (
          <div className="mt-4 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
            {analysis.encouragement}
          </div>
        )}

        {analysis.weaknesses.length > 0 && (
          <div className="mt-4">
            <span className="text-sm font-medium text-gray-600">
              보완할 개념:
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.weaknesses.map((w, i) => (
                <span
                  key={i}
                  className="rounded-full bg-orange-100 px-3 py-1 text-sm text-orange-700"
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Frame#8: 추천 문제 */}
      {analysis.nextProblems && analysis.nextProblems.length > 0 && (
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">추천 문제</h2>
          <div className="grid gap-3">
            {analysis.nextProblems.map((np, i) => (
              <button
                key={np.id || i}
                onClick={() => handleRecommendedProblem(np)}
                disabled={loadingRecommended !== null}
                className="cursor-pointer rounded-lg border p-4 text-left transition-shadow hover:border-blue-300 hover:shadow-md disabled:opacity-50"
              >
                <div className="mb-2">
                  <TheoryContent content={np.question} />
                </div>
                <p className="text-sm text-gray-500">{np.reason}</p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-yellow-500">
                      {"★".repeat(np.difficulty)}{"☆".repeat(3 - np.difficulty)}
                    </span>
                    <span className="rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-600">
                      {np.targetWeakness}
                    </span>
                  </div>
                  <span className="text-xs text-blue-600">
                    {loadingRecommended === np.question ? "문제 생성 중..." : "풀어보기 →"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 대화형 피드백 — 멀티모달 채팅 */}
      <div className="mb-6">
        <MultimodalChat
          problemContext={{
            question: problem.question,
            answer: problem.answer,
            studentAnswer: data.submission.finalAnswer || "(패스)",
            isCorrect: analysis.isCorrect,
            processAnalysis: analysis.processAnalysis,
            weaknesses: analysis.weaknesses,
          }}
        />
      </div>

      {/* 다음 행동 선택 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          onClick={handleSameChapterNewProblem}
          disabled={generatingNew}
          className="rounded-lg bg-blue-600 px-6 py-4 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generatingNew ? "문제 생성 중..." : "같은 단원 다른 문제"}
        </button>
        <button
          onClick={() => router.push(chapterHref)}
          className="rounded-lg border border-gray-300 px-6 py-4 font-medium text-gray-700 hover:bg-gray-50"
        >
          단원으로 돌아가기
        </button>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg border border-gray-300 px-6 py-4 font-medium text-gray-700 hover:bg-gray-50"
        >
          다른 단원 선택
        </button>
      </div>
    </div>
  );
}
