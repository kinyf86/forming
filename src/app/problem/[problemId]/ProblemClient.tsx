"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Problem } from "@/types";
import {
  ExcalidrawCanvas,
  extractCanvasText,
  describeCanvasDrawing,
  exportCanvasAsBase64,
} from "@/components/canvas/ExcalidrawCanvas";
import { TheoryContent } from "@/components/theory/TheoryContent";

interface ProblemClientProps {
  problem: Problem;
  topicTitle: string;
}

export function ProblemClient({ problem, topicTitle }: ProblemClientProps) {
  const router = useRouter();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (passed: boolean) => {
    setLoading(true);
    setError(null);

    const canvasText = apiRef.current ? extractCanvasText(apiRef.current) : "";
    const drawingDescription = apiRef.current
      ? describeCanvasDrawing(apiRef.current)
      : "";
    const canvasImage = apiRef.current
      ? await exportCanvasAsBase64(apiRef.current)
      : null;
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          canvasText,
          drawingDescription,
          canvasImage,
          finalAnswer: passed ? "" : finalAnswer,
          passed,
        }),
      });

      if (!res.ok) throw new Error("분석 요청에 실패했습니다.");

      const result = await res.json();

      // Save result to sessionStorage for result page
      const submissionId = `sub-${Date.now()}`;
      sessionStorage.setItem(
        submissionId,
        JSON.stringify({
          problem,
          analysis: result,
          submission: {
            canvasText,
            drawingDescription,
            finalAnswer: passed ? "" : finalAnswer,
            passed,
          },
        })
      );

      router.push(`/result/${submissionId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/theory/${problem.topicId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; {topicTitle}
        </Link>
      </div>

      {/* Frame#4: 문제 영역 */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">문제</h2>
        <TheoryContent content={problem.question} />
      </div>

      {/* Frame#5: Reference 영역 */}
      <div className="mb-6">
        <button
          onClick={() => setShowHints(!showHints)}
          className="text-sm text-blue-600 hover:underline"
        >
          {showHints ? "힌트 숨기기 ▲" : "힌트 보기 ▼"}
        </button>
        {showHints && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <ul className="space-y-2">
              {problem.hints.map((hint, i) => (
                <li key={i} className="text-sm text-blue-800">
                  <TheoryContent content={`**힌트 ${i + 1}:** ${hint}`} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Frame#6: 답변 영역 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">풀이 과정</h2>
        <ExcalidrawCanvas onApiReady={handleApiReady} height="800px" />

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            최종 답
          </label>
          <input
            type="text"
            value={finalAnswer}
            onChange={(e) => setFinalAnswer(e.target.value)}
            placeholder="답을 입력하세요"
            className="w-full rounded-lg border px-4 py-3 text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading || !finalAnswer.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "분석 중..." : "제출"}
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            패스
          </button>
        </div>
      </div>
    </div>
  );
}
