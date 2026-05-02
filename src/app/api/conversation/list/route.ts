import { NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/lib/history";

/**
 * GET /api/conversation/list?clientId=...&limit=50
 * 특정 클라이언트의 최근 세션 요약 (sessionId, sessionType, 턴 수, 시간 범위).
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  const limit = parseInt(
    request.nextUrl.searchParams.get("limit") || "50",
    10
  );

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId가 필요합니다." },
      { status: 400 }
    );
  }

  const sessions = listSessions(clientId, limit);
  return NextResponse.json({ clientId, sessions });
}
