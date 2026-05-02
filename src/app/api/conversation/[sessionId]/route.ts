import { NextRequest, NextResponse } from "next/server";
import { getConversation, getAICalls } from "@/lib/history";

/**
 * GET /api/conversation/[sessionId]?clientId=...&includeAICalls=true
 * 세션 하나의 전체 대화 턴 + 선택적으로 AI 호출 원문.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const clientId = request.nextUrl.searchParams.get("clientId");
  const includeAICalls =
    request.nextUrl.searchParams.get("includeAICalls") === "true";

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId가 필요합니다." },
      { status: 400 }
    );
  }

  const turns = getConversation(clientId, sessionId);
  const aiCalls = includeAICalls ? getAICalls(clientId, sessionId) : undefined;

  return NextResponse.json({ sessionId, clientId, turns, aiCalls });
}
