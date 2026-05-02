import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { askClaude, askClaudeWithImage } from "@/lib/claude";
import { appendConversationTurn } from "@/lib/history";
import { getLocale } from "@/lib/locale";

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      problemContext,
      canvasImage,
      sessionId: clientSessionId,
      clientId = "default",
    } = await request.json();

    const chatHistory = messages
      .map((m: { role: string; content: string }) =>
        m.role === "user" ? `학생: ${m.content}` : `튜터: ${m.content}`
      )
      .join("\n\n");

    const locale = getLocale();

    const imageNote = canvasImage
      ? "\n\n## 학생의 손글씨/그림\n첨부된 이미지는 학생이 직접 그린 풀이/질문입니다. 이미지를 꼼꼼히 분석하여 답변에 반영해주세요."
      : "";

    const contextSection = problemContext
      ? `\n## 문제 컨텍스트
- 문제: ${problemContext.question}
- 정답: ${problemContext.answer}
- 학생의 답: ${problemContext.studentAnswer}
- 정답 여부: ${problemContext.isCorrect ? "정답" : "오답"}
- 학생의 풀이과정 분석: ${problemContext.processAnalysis}
- 보완할 개념: ${problemContext.weaknesses?.join(", ") || "없음"}`
      : "";

    const prompt = `당신은 ${locale.country} 초등학교 수학/과학 튜터입니다.
${locale.tutorPrompt}
수식은 LaTeX ($...$)로, 표는 마크다운 표 형식으로 작성하세요.
${contextSection}${imageNote}

## 대화 내역
${chatHistory}

위 대화의 마지막 학생 메시지에 대해 튜터로서 답변해주세요.
- 학생이 어디서 실수했는지 구체적으로 설명해주세요
- 필요하면 관련 개념을 쉽게 다시 설명해주세요
- 짧고 명확하게 답변하세요 (3~5문장)
- 마크다운 형식으로 답변하세요
- 시각적 설명이 도움이 되는 경우, SVG 다이어그램을 포함하세요:
  - <svg viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"> 로 시작
  - 모든 텍스트는 text-anchor="middle"
  - 색상: 주요 #4A90D9, 보조 #5CB85C, 강조 #E67E22
  - 한국어 레이블, 외부 참조 금지`;

    // Derive a stable-ish session: prefer client-supplied, fall back to per-problem.
    // Problem-scoped sessions keep follow-up questions on the same problem grouped.
    const sessionId: string =
      clientSessionId ||
      `chat-${problemContext?.problemId || "standalone"}-${new Date().toISOString().slice(0, 10)}`;
    const logCtx = { clientId, endpoint: "/api/chat", sessionId };

    // Last user message in the array is the new one (prior ones are context).
    const lastUserMsg = [...messages]
      .reverse()
      .find((m: { role: string; content: string }) => m.role === "user");

    if (lastUserMsg?.content) {
      appendConversationTurn(clientId, {
        type: "conversation_turn",
        id: `turn-${randomUUID()}`,
        timestamp: Date.now(),
        sessionId,
        sessionType: "feedback_chat",
        role: "user",
        text: lastUserMsg.content,
        contextRef: {
          problemId: problemContext?.problemId,
        },
        attachments: canvasImage ? [{ type: "canvas_image", path: null }] : [],
      });
    }

    const response = canvasImage
      ? await askClaudeWithImage(prompt, canvasImage, "image/webp", logCtx)
      : await askClaude(prompt, logCtx);

    appendConversationTurn(clientId, {
      type: "conversation_turn",
      id: `turn-${randomUUID()}`,
      timestamp: Date.now(),
      sessionId,
      sessionType: "feedback_chat",
      role: "assistant",
      text: response,
      contextRef: {
        problemId: problemContext?.problemId,
      },
      attachments: [],
    });

    return NextResponse.json({ content: response, sessionId });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "채팅 오류" },
      { status: 500 }
    );
  }
}
