import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { askClaude, parseJsonFromResponse } from "@/lib/claude";
import { appendRecord } from "@/lib/history";
import { getRuntimeCacheDir } from "@/lib/problems";
import type { Problem } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { question, topicId, difficulty, targetWeakness, clientId = "default" } = await request.json();

    const problemId = `rec-${randomUUID().slice(0, 8)}`;
    const subject = topicId.startsWith("math") ? "수학" : "과학";

    const prompt = `당신은 대한민국 초등학교 6학년 ${subject} 튜터입니다.

아래 문제에 대해 정답, 풀이, 객관식 보기를 완성해주세요.

## 문제
${question}

## 관련 약점
${targetWeakness}

## 요청사항
- choices에 5개의 보기를 포함하세요 (정답 1개 + 오답 4개, 순서는 랜덤)
- answer는 반드시 choices 중 하나와 정확히 일치해야 합니다
- solution에 단계별 풀이를 작성해주세요
- hints에 힌트 2개를 작성해주세요
반드시 아래 JSON 형식으로만 응답하세요.

{
  "id": "${problemId}",
  "topicId": "${topicId}",
  "question": "${question.replace(/"/g, '\\"')}",
  "difficulty": ${difficulty || 2},
  "hints": ["힌트1", "힌트2"],
  "choices": ["보기1", "보기2", "보기3", "보기4", "보기5"],
  "solution": "단계별 정답 풀이 (한국어, LaTeX 수식 사용 가능, 마크다운)",
  "answer": "정답 (choices 중 하나와 정확히 일치)",
  "concepts": ["${targetWeakness}"]
}`;

    // Recommended problems are short, structured JSON — haiku is plenty fast and accurate.
    const response = await askClaude(
      prompt,
      {
        clientId,
        endpoint: "/api/complete-problem",
        sessionId: `gen-${problemId}`,
      },
      "fast"
    );
    const problem = parseJsonFromResponse(response) as Problem;
    problem.id = problemId;

    // Save to runtime cache (gitignored)
    const runtimeDir = getRuntimeCacheDir();
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(runtimeDir, `${problemId}.json`),
      JSON.stringify(problem, null, 2),
      "utf-8"
    );

    // Save generation history
    appendRecord(clientId, {
      type: "problem_generated",
      id: `hist-${problemId}`,
      timestamp: Date.now(),
      problemId: problem.id,
      chapterId: topicId,
      difficulty: problem.difficulty,
      question: problem.question,
      choices: problem.choices || [],
      answer: problem.answer,
      solution: problem.solution,
      concepts: problem.concepts,
    });

    return NextResponse.json(problem);
  } catch (error) {
    console.error("Complete problem error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "문제 완성 중 오류" },
      { status: 500 }
    );
  }
}
