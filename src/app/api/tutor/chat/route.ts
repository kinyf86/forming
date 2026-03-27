import { NextRequest, NextResponse } from "next/server";
import { askClaude, askClaudeWithImage } from "@/lib/claude";
import { buildSocraticPrompt, type TutorSessionState, type TutorResponse } from "@/lib/tutor-prompts";
import { appendTutorRecord } from "@/lib/history";
import { buildCurriculumContext } from "@/lib/curriculum";

function parseTutorResponse(text: string, sessionState: TutorSessionState): TutorResponse {
  // Try <json>...</json> tags first
  const tagMatch = text.match(/<json>([\s\S]*?)<\/json>/);
  if (tagMatch) {
    try {
      return JSON.parse(tagMatch[1]) as TutorResponse;
    } catch { /* fall through */ }
  }

  // Try ```json blocks
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    try {
      return JSON.parse(codeMatch[1]) as TutorResponse;
    } catch { /* fall through */ }
  }

  // Try raw JSON object
  const objectMatch = text.match(/\{[\s\S]*"response"[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as TutorResponse;
    } catch { /* fall through */ }
  }

  // Fallback: treat entire text as response, action stays to prevent state corruption
  return {
    response: text.replace(/<json>[\s\S]*<\/json>/g, "").trim() || text,
    action: "stay",
    concept: sessionState.current_concept || "",
    graph_update: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      sessionId,
      sessionState,
      canvasImage,
      clientId = "tutor-default",
    } = body as {
      message: string;
      sessionId: string;
      sessionState: TutorSessionState;
      canvasImage?: string;
      clientId?: string;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "메시지가 필요합니다." }, { status: 400 });
    }

    // Build curriculum context if we have a concept that maps to a chapter
    const curriculumContext = sessionState.current_concept
      ? undefined // AI infers prerequisites at runtime, no pre-mapped data
      : undefined;

    const prompt = buildSocraticPrompt({
      message,
      sessionState,
      curriculumContext,
      hasImage: !!canvasImage,
    });

    let rawResponse: string;
    try {
      rawResponse = canvasImage
        ? await askClaudeWithImage(prompt, canvasImage, "image/webp")
        : await askClaude(prompt);
    } catch (err) {
      // Retry once on timeout
      if (err instanceof Error && err.message.includes("timeout")) {
        try {
          rawResponse = canvasImage
            ? await askClaudeWithImage(prompt, canvasImage, "image/webp")
            : await askClaude(prompt);
        } catch {
          return NextResponse.json(
            { error: "잠깐만요, AI가 응답하지 못했습니다. 다시 시도해주세요." },
            { status: 503 }
          );
        }
      } else {
        throw err;
      }
    }

    const parsed = parseTutorResponse(rawResponse, sessionState);

    // Log the turn (non-blocking, errors swallowed in appendTutorRecord)
    appendTutorRecord(clientId, {
      type: "tutor_turn",
      id: `${sessionId}-${Date.now()}`,
      timestamp: Date.now(),
      sessionId,
      userMessage: message,
      assistantResponse: parsed.response,
      action: parsed.action,
      concept: parsed.concept,
      current_concept: sessionState.current_concept,
      prerequisite_stack: sessionState.prerequisite_stack,
    });

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Tutor API error:", err);
    return NextResponse.json(
      { error: "튜터 응답 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
