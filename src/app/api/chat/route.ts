import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/claude";
import { getLocale } from "@/lib/locale";

export async function POST(request: NextRequest) {
  try {
    const { messages, problemContext } = await request.json();

    const chatHistory = messages
      .map((m: { role: string; content: string }) =>
        m.role === "user" ? `학생: ${m.content}` : `튜터: ${m.content}`
      )
      .join("\n\n");

    const locale = getLocale();

    const prompt = `당신은 ${locale.country} 초등학교 수학/과학 튜터입니다. 학생이 문제를 풀고 난 후 대화하고 있습니다.
${locale.tutorPrompt}
수식은 LaTeX ($...$)로, 표는 마크다운 표 형식으로, 도형은 텍스트로 설명하세요.

## 문제 컨텍스트
- 문제: ${problemContext.question}
- 정답: ${problemContext.answer}
- 학생의 답: ${problemContext.studentAnswer}
- 정답 여부: ${problemContext.isCorrect ? "정답" : "오답"}
- 학생의 풀이과정 분석: ${problemContext.processAnalysis}
- 보완할 개념: ${problemContext.weaknesses?.join(", ") || "없음"}

## 대화 내역
${chatHistory}

위 대화의 마지막 학생 메시지에 대해 튜터로서 답변해주세요.
- 학생이 어디서 실수했는지 구체적으로 설명해주세요
- 필요하면 관련 개념을 쉽게 다시 설명해주세요
- 짧고 명확하게 답변하세요 (3~5문장)
- 마크다운 형식으로 답변하세요`;

    const response = await askClaude(prompt);

    return NextResponse.json({ content: response });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "채팅 오류" },
      { status: 500 }
    );
  }
}
