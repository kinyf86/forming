import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getChapter } from "@/lib/curriculum";
import { askClaude, parseJsonFromResponse } from "@/lib/claude";
import { appendRecord } from "@/lib/history";
import type { Problem } from "@/types";

const GENERATED_DIR = path.join(process.cwd(), "src/data/generated");

function saveGeneratedProblem(problem: Problem): void {
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }
  const filePath = path.join(GENERATED_DIR, `${problem.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(problem, null, 2), "utf-8");
}

export async function POST(request: NextRequest) {
  try {
    const { chapterId, difficulty = 1, clientId = "default" } = await request.json();

    const chapter = getChapter(chapterId);
    if (!chapter) {
      return NextResponse.json(
        { error: "단원을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const subject = chapterId.startsWith("math") ? "수학" : "과학";
    const problemId = `gen-${randomUUID().slice(0, 8)}`;

    const difficultyLabels: Record<number, string> = {
      1: "기본 (교과서 예제 수준, 개념을 직접 적용하는 단순한 문제)",
      2: "응용 (두 가지 이상의 개념을 결합하거나, 조건이 추가된 문제)",
      3: "심화 (수학능력시험/경시대회 수준, 여러 단계의 사고가 필요한 고난도 문제)",
    };
    const diffLevel = difficultyLabels[difficulty] || difficultyLabels[1];

    const prompt = `당신은 대한민국 초등학교 6학년 ${subject} 튜터입니다.

## 단원 정보
- ${chapter.chapter}단원: ${chapter.title}
- 학습 개념: ${chapter.concepts.join(", ")}

## 난이도
**${diffLevel}**

## 요청사항
위 단원에서 지정된 난이도에 맞는 **객관식** 문제를 1개 생성해주세요.
- choices에 5개의 보기를 포함하세요 (정답 1개 + 오답 4개, 순서는 랜덤)
- answer는 반드시 choices 중 하나와 정확히 일치해야 합니다
- 분수, 수식 등 타자로 치기 어려운 답도 보기로 제공해주세요
- 난이도 ${difficulty}에 맞게 문제의 복잡도를 조절하세요
- 도형이나 그림이 필요한 문제라면 "diagram" 필드에 SVG 코드를 포함하세요
- 풀이에 단계별 도형 설명이 필요하면 "solutionDiagram" 필드에 SVG 코드를 포함하세요

## SVG 작성 규칙
- viewBox="0 0 400 300" 사용
- 한글 텍스트는 font-family="sans-serif" 사용
- 색상: 도형 선은 #333, 보조선은 #999 점선, 강조는 #2563eb(파란), 각도 표시는 #dc2626(빨간)
- 텍스트 크기: 숫자/라벨 font-size="14", 꼭짓점 이름 font-size="16" bold
- 풀이 SVG에서 단계별로 보여주려면 각 단계를 class="step"으로 감싸세요

반드시 아래 JSON 형식으로만 응답하세요.

{
  "id": "${problemId}",
  "topicId": "${chapterId}",
  "question": "문제 내용 (한국어, LaTeX 수식 사용 가능, '아래 그림과 같이' 등 도형 참조 가능)",
  "diagram": "<svg>...</svg> 또는 null (도형이 필요 없으면 null)",
  "difficulty": ${difficulty},
  "hints": ["힌트1", "힌트2"],
  "choices": ["보기1", "보기2", "보기3", "보기4", "보기5"],
  "solution": "단계별 정답 풀이 (한국어, LaTeX 수식 사용 가능, 마크다운)",
  "solutionDiagram": "<svg>...</svg> 또는 null (풀이 도형이 필요 없으면 null)",
  "answer": "정답 (choices 중 하나와 정확히 일치)",
  "concepts": ["이 문제에서 다루는 개념1", "개념2"]
}`;

    const response = await askClaude(prompt);
    const problem = parseJsonFromResponse(response) as Problem;

    // Ensure consistent ID
    problem.id = problemId;

    // Save to file
    saveGeneratedProblem(problem);

    // Save generation history
    appendRecord(clientId, {
      type: "problem_generated",
      id: `hist-${problemId}`,
      timestamp: Date.now(),
      problemId: problem.id,
      chapterId,
      difficulty: problem.difficulty,
      question: problem.question,
      choices: problem.choices || [],
      answer: problem.answer,
      solution: problem.solution,
      concepts: problem.concepts,
    });

    return NextResponse.json(problem);
  } catch (error) {
    console.error("Problem generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "문제 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
