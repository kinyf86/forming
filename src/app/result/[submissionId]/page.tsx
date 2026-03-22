"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Problem, AnalysisResult } from "@/types";
import { TheoryContent } from "@/components/theory/TheoryContent";

interface StoredResult {
  problem: Problem;
  analysis: AnalysisResult;
  submission: {
    canvasText: string;
    finalAnswer: string;
    passed: boolean;
  };
}

export default function ResultPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<StoredResult | null>(null);

  useEffect(() => {
    const submissionId = params.submissionId as string;
    const stored = sessionStorage.getItem(submissionId);
    if (stored) {
      setData(JSON.parse(stored));
    }
  }, [params.submissionId]);

  if (!data) {
    return (
      <div className="py-20 text-center text-gray-500">
        결과를 불러오는 중...
      </div>
    );
  }

  const { problem, analysis } = data;

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/theory/${problem.topicId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; 주제로 돌아가기
        </Link>
      </div>

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
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">추천 문제</h2>
          <div className="grid gap-3">
            {analysis.nextProblems.map((np, i) => (
              <div
                key={np.id || i}
                className="rounded-lg border p-4 transition-shadow hover:shadow-md"
              >
                <div className="mb-2">
                  <TheoryContent content={np.question} />
                </div>
                <p className="text-sm text-gray-500">{np.reason}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    난이도 {"★".repeat(np.difficulty)}
                  </span>
                  <span className="rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-600">
                    {np.targetWeakness}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 text-center">
        <button
          onClick={() => router.push(`/theory/${problem.topicId}`)}
          className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white hover:bg-blue-700"
        >
          다른 문제 풀기
        </button>
      </div>
    </div>
  );
}
