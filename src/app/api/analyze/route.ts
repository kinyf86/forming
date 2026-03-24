import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getProblem } from "@/lib/problems";
import { askClaude, askClaudeWithImage, parseJsonFromResponse } from "@/lib/claude";
import { buildAnalysisPrompt } from "@/lib/prompts";
import { appendRecord } from "@/lib/history";
import type { AnalysisResult, Problem } from "@/types";

const CANVAS_DIR = path.join(process.cwd(), "src/data/history/canvas");

function saveCanvasImage(submissionId: string, base64: string): string {
  if (!fs.existsSync(CANVAS_DIR)) {
    fs.mkdirSync(CANVAS_DIR, { recursive: true });
  }
  const filePath = path.join(CANVAS_DIR, `${submissionId}.png`);
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      problemId,
      canvasText,
      drawingDescription,
      canvasImage,
      finalAnswer,
      passed,
      problem: clientProblem,
      clientId = "default",
    } = body;

    // Try static problem first, fallback to client-provided problem (AI-generated)
    const problem: Problem | undefined = getProblem(problemId) ?? clientProblem;
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
      ? await askClaudeWithImage(prompt, canvasImage, "image/webp")
      : await askClaude(prompt);

    const analysis = parseJsonFromResponse(response) as AnalysisResult;

    // Save canvas image
    const submissionId = `sub-${Date.now()}`;
    let canvasImagePath: string | null = null;
    if (canvasImage) {
      canvasImagePath = saveCanvasImage(submissionId, canvasImage);
    }

    // Save submission history
    appendRecord(clientId, {
      type: "submission",
      id: submissionId,
      timestamp: Date.now(),
      problemId: problem.id,
      chapterId: problem.topicId,
      question: problem.question,
      studentAnswer: finalAnswer || "(패스)",
      correctAnswer: problem.answer,
      isCorrect: analysis.isCorrect,
      passed: !!passed,
      canvasImagePath,
      processAnalysis: analysis.processAnalysis,
      correctSolution: analysis.correctSolution,
      weaknesses: analysis.weaknesses,
      encouragement: analysis.encouragement,
    });

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
