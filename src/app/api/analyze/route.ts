import { NextRequest, NextResponse } from "next/server";
import { getProblem } from "@/lib/problems";
import { askClaude, askClaudeWithImage, parseJsonFromResponse } from "@/lib/claude";
import { buildAnalysisPrompt } from "@/lib/prompts";
import type { AnalysisResult } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { problemId, canvasText, drawingDescription, canvasImage, finalAnswer, passed } =
      body;

    const problem = getProblem(problemId);
    if (!problem) {
      return NextResponse.json(
        { error: "문제를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const prompt = buildAnalysisPrompt({
      problem,
      canvasText: canvasText || "",
      drawingDescription: drawingDescription || "",
      finalAnswer: finalAnswer || "",
      passed: !!passed,
      hasImage: !!canvasImage,
    });

    // Use vision if canvas image is available
    const response = canvasImage
      ? await askClaudeWithImage(prompt, canvasImage, "image/png")
      : await askClaude(prompt);

    const analysis = parseJsonFromResponse(response) as AnalysisResult;

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "분석 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
