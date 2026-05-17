import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getProblem } from "@/lib/problems";
import { askClaude, askClaudeWithImage, parseJsonFromResponse } from "@/lib/claude";
import { buildAnalysisPrompt } from "@/lib/prompts";
import { appendRecord, appendConversationTurn } from "@/lib/history";
import { PathTraversalError } from "@/lib/sanitize";
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

    // One submission = one session. submissionId is pre-allocated so logs link.
    const submissionId = `sub-${Date.now()}`;
    const sessionId = submissionId;
    const logCtx = {
      clientId,
      endpoint: "/api/analyze",
      sessionId,
    };

    // User turn: student's submission (answer + canvas) recorded first.
    appendConversationTurn(clientId, {
      type: "conversation_turn",
      id: `turn-${randomUUID()}`,
      timestamp: Date.now(),
      sessionId,
      sessionType: "problem_feedback",
      role: "user",
      text: finalAnswer || "(패스)",
      contextRef: {
        problemId: problem.id,
        chapterId: problem.topicId,
      },
      attachments: canvasImage ? [{ type: "canvas_image", path: null }] : [],
    });

    // Use vision if canvas image is available. Haiku 4.5 is fast and good
    // enough for grading + short feedback; sonnet was the bottleneck here.
    const response = canvasImage
      ? await askClaudeWithImage(prompt, canvasImage, "image/webp", logCtx, "fast")
      : await askClaude(prompt, logCtx, "fast");

    const analysis = parseJsonFromResponse(response) as AnalysisResult;

    // Save canvas image
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

    // Assistant turn: AI's analysis + solution feedback.
    appendConversationTurn(clientId, {
      type: "conversation_turn",
      id: `turn-${randomUUID()}`,
      timestamp: Date.now(),
      sessionId,
      sessionType: "problem_feedback",
      role: "assistant",
      text: analysis.processAnalysis,
      contextRef: {
        problemId: problem.id,
        chapterId: problem.topicId,
      },
      attachments: canvasImagePath
        ? [{ type: "canvas_image", path: canvasImagePath }]
        : [],
      meta: {
        isCorrect: analysis.isCorrect,
        passed: !!passed,
        weaknesses: analysis.weaknesses,
      },
    });

    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof PathTraversalError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
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
