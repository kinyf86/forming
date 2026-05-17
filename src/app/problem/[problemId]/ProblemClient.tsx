"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientId } from "@/lib/client-id";
import type { Problem } from "@/types";
import DrawingCanvas, {
  type DrawingCanvasAPI,
} from "@/components/canvas/DrawingCanvas";
import { TheoryContent } from "@/components/theory/TheoryContent";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { DiagramSvg } from "@/components/ui/DiagramSvg";

interface ProblemClientProps {
  problem: Problem;
  topicTitle: string;
  breadcrumb?: BreadcrumbItem[];
}

export function ProblemClient({ problem, topicTitle, breadcrumb }: ProblemClientProps) {
  const router = useRouter();
  const canvasRef = useRef<DrawingCanvasAPI>(null);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagram, setDiagram] = useState<string | null>(problem.diagram ?? null);
  const [diagramLoading, setDiagramLoading] = useState(false);

  // Auto-generate diagram if the question describes a shape that benefits
  // from visualization. Keyword set covers common middle/high school cases
  // (전개도, 직육면체, 원기둥, 좌표 …) so we don't miss obvious geometry problems.
  useEffect(() => {
    const needsDiagram = /그림|도형|아래|전개도|직육면체|정육면체|각기둥|원기둥|각뿔|원뿔|구|입체|평면도|좌표|선분|반직선|평행사변형|마름모|사다리꼴|다각형|다면체/;
    if (!diagram && needsDiagram.test(problem.question)) {
      setDiagramLoading(true);
      fetch("/api/generate-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: problem.id, question: problem.question }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.diagram) setDiagram(data.diagram);
        })
        .catch(() => {})
        .finally(() => setDiagramLoading(false));
    }
  }, [problem.id, problem.question, diagram]);

  const handleSubmit = async (passed: boolean) => {
    setLoading(true);
    setError(null);

    const canvas = canvasRef.current;
    const canvasText = canvas ? canvas.extractText() : "";
    const drawingDescription = canvas ? canvas.describeDrawing() : "";
    const canvasImage = canvas ? await canvas.exportAsBase64() : null;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          problem,
          canvasText,
          drawingDescription,
          canvasImage,
          finalAnswer: passed ? "" : finalAnswer,
          passed,
          clientId: getClientId(),
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
      {breadcrumb && <Breadcrumb items={breadcrumb} />}

      {/* Frame#4: 문제 영역 */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold">문제</h2>
          <span className="text-sm text-yellow-500">
            {"★".repeat(problem.difficulty)}{"☆".repeat(3 - problem.difficulty)}
          </span>
        </div>
        <TheoryContent content={problem.question} />
        {diagramLoading && (
          <div className="my-4 flex justify-center">
            <span className="text-sm text-gray-400">도형 생성 중...</span>
          </div>
        )}
        {diagram && <DiagramSvg svg={diagram} animated />}
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
        <DrawingCanvas ref={canvasRef} height="800px" />

        {/* 객관식 보기 */}
        {problem.choices && problem.choices.length > 0 ? (
          <div className="mt-6">
            <label className="mb-3 block text-sm font-medium text-gray-700">
              답 선택
            </label>
            <div className="grid gap-2">
              {problem.choices.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => setFinalAnswer(choice)}
                  disabled={loading}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    finalAnswer === choice
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                      finalAnswer === choice
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-lg">
                    <TheoryContent content={choice} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
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
        )}

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
