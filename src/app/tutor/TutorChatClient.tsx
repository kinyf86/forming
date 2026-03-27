"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DrawingCanvas, {
  type DrawingCanvasAPI,
} from "@/components/canvas/DrawingCanvas";
import { TheoryContent } from "@/components/theory/TheoryContent";
import SvgRenderer from "@/components/ui/SvgRenderer";
import type { TutorSessionState, TutorResponse, CurriculumChip } from "@/lib/tutor-prompts";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
}

const MAX_STACK_DEPTH = 10;

function getInitialSessionId(): string {
  if (typeof window === "undefined") return "";
  const stored = sessionStorage.getItem("tutor_session_id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  sessionStorage.setItem("tutor_session_id", id);
  return id;
}

function getInitialState(sessionId: string): {
  sessionState: TutorSessionState;
  messages: Message[];
} {
  if (typeof window === "undefined" || !sessionId) {
    return {
      sessionState: { current_concept: "", prerequisite_stack: [], confirmed_concepts: [], messages: [], fail_count: 0 },
      messages: [],
    };
  }
  const stored = sessionStorage.getItem(`tutor_state_${sessionId}`);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return { sessionState: parsed.sessionState, messages: parsed.messages || [] };
    } catch { /* fall through */ }
  }
  return {
    sessionState: { current_concept: "", prerequisite_stack: [], confirmed_concepts: [], messages: [], fail_count: 0 },
    messages: [],
  };
}

export default function TutorChatClient({ chips }: { chips: CurriculumChip[] }) {
  const [sessionId, setSessionId] = useState("");
  const [sessionState, setSessionState] = useState<TutorSessionState>({
    current_concept: "", prerequisite_stack: [], confirmed_concepts: [], messages: [], fail_count: 0,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const canvasRef = useRef<DrawingCanvasAPI>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize from sessionStorage on mount
  useEffect(() => {
    const id = getInitialSessionId();
    setSessionId(id);
    const initial = getInitialState(id);
    setSessionState(initial.sessionState);
    setMessages(initial.messages);
  }, []);

  // Persist to sessionStorage on state change
  useEffect(() => {
    if (!sessionId) return;
    sessionStorage.setItem(`tutor_state_${sessionId}`, JSON.stringify({ sessionState, messages }));
  }, [sessionId, sessionState, messages]);

  const sendMessage = async (text: string, chipConcept?: string) => {
    if (loading) return;

    const canvas = canvasRef.current;
    const hasDrawing = canvasOpen && canvas && !canvas.isEmpty();
    const hasText = text.trim().length > 0;
    if (!hasDrawing && !hasText) return;

    const messageText = hasText ? text.trim() : "(그림으로 질문)";

    let canvasImage: string | null = null;
    let imageDataUrl: string | undefined;
    if (hasDrawing && canvas) {
      canvasImage = await canvas.exportAsBase64(500);
      if (canvasImage) {
        imageDataUrl = `data:image/webp;base64,${canvasImage}`;
      }
    }

    const userMessage: Message = { role: "user", content: messageText, imageDataUrl };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

    if (hasDrawing && canvas) canvas.clear();

    // If starting from a chip, set the concept
    const currentState: TutorSessionState = chipConcept
      ? { ...sessionState, current_concept: chipConcept }
      : sessionState;

    setLoading(true);

    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          sessionId,
          sessionState: {
            ...currentState,
            messages: currentState.messages.slice(-20), // keep last 20 turns for context
          },
          canvasImage,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "응답 오류");
      }

      const data = (await res.json()) as TutorResponse;

      // Update session state based on action
      const updatedState = { ...currentState };
      updatedState.messages = [
        ...currentState.messages,
        { role: "user" as const, content: messageText },
        { role: "assistant" as const, content: data.response },
      ];

      switch (data.action) {
        case "push":
          if (updatedState.prerequisite_stack.length < MAX_STACK_DEPTH) {
            if (updatedState.current_concept) {
              updatedState.prerequisite_stack = [...updatedState.prerequisite_stack, updatedState.current_concept];
            }
            updatedState.current_concept = data.concept;
            updatedState.fail_count = 0;
          }
          break;
        case "pop":
          if (data.concept) {
            updatedState.confirmed_concepts = [...new Set([...updatedState.confirmed_concepts, data.concept])];
          }
          if (updatedState.prerequisite_stack.length > 0) {
            const stack = [...updatedState.prerequisite_stack];
            updatedState.current_concept = stack.pop()!;
            updatedState.prerequisite_stack = stack;
          }
          updatedState.fail_count = 0;
          break;
        case "complete":
          if (data.concept) {
            updatedState.confirmed_concepts = [...new Set([...updatedState.confirmed_concepts, data.concept])];
          }
          updatedState.current_concept = "";
          updatedState.fail_count = 0;
          break;
        case "stay":
          updatedState.fail_count = (updatedState.fail_count || 0) + 1;
          if (data.concept) updatedState.current_concept = data.concept;
          break;
      }

      setSessionState(updatedState);
      setMessages([...newMessages, { role: "assistant", content: data.response }]);
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "응답을 가져오지 못했습니다. 다시 시도해주세요." },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    }
  };

  const startNewSession = () => {
    const newId = crypto.randomUUID();
    sessionStorage.removeItem(`tutor_state_${sessionId}`);
    sessionStorage.setItem("tutor_session_id", newId);
    setSessionId(newId);
    setSessionState({ current_concept: "", prerequisite_stack: [], confirmed_concepts: [], messages: [], fail_count: 0 });
    setMessages([]);
    setInput("");
  };

  const renderAssistantContent = (content: string) => {
    if (content.includes("<svg")) {
      return content.split(/(<svg[\s\S]*?<\/svg>)/g).map((part, j) =>
        part.startsWith("<svg") ? (
          <SvgRenderer key={j} svg={part} className="my-3" />
        ) : part.trim() ? (
          <TheoryContent key={j} content={part} />
        ) : null
      );
    }
    return <TheoryContent content={content} />;
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 80px)" }}>
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-blue-600">홈</Link>
        <span>&gt;</span>
        <span className="text-gray-800 font-medium">AI 튜터</span>
      </nav>

      {/* Concept indicator */}
      {sessionState.current_concept && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700 font-medium">
            {sessionState.current_concept}
          </span>
          {sessionState.prerequisite_stack.length > 0 && (
            <span className="text-gray-400">
              (깊이 {sessionState.prerequisite_stack.length + 1})
            </span>
          )}
          {sessionState.confirmed_concepts.length > 0 && (
            <span className="text-green-600">
              ✓ {sessionState.confirmed_concepts.length}개 이해 완료
            </span>
          )}
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 rounded-xl border bg-white shadow-sm flex flex-col">
        {/* Messages */}
        {messages.length > 0 ? (
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
            style={{ maxHeight: "60vh" }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white max-w-[75%]"
                      : "bg-gray-50 text-gray-800 max-w-[90%] w-full"
                  }`}
                >
                  {msg.role === "user" ? (
                    <>
                      {msg.imageDataUrl && (
                        <img
                          src={msg.imageDataUrl}
                          alt="내 그림"
                          className="rounded-lg mb-2 max-h-32 border border-blue-400"
                        />
                      )}
                      <p>{msg.content}</p>
                    </>
                  ) : (
                    renderAssistantContent(msg.content)
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>·</span>
                  </span>
                  {" "}생각하고 있어요...
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty state with curriculum chips */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
            <span className="text-5xl mb-4">💬</span>
            <h2 className="text-xl font-bold text-gray-800 mb-2">무엇이든 물어보세요</h2>
            <p className="text-gray-500 text-sm mb-8 text-center">
              수학이나 과학에서 궁금한 것을 질문하면<br />
              AI 튜터가 질문을 통해 함께 생각해줘요
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {chips.map((chip) => (
                <button
                  key={chip.chapterId}
                  onClick={() => sendMessage(`${chip.label}에 대해 배우고 싶어요`, chip.concept)}
                  disabled={loading}
                  className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="border-t px-4 py-3 space-y-2">
          {/* Toggle canvas */}
          {canvasOpen && (
            <div className="rounded-lg border bg-gray-50 p-2">
              <DrawingCanvas ref={canvasRef} height="200px" compact />
              <button
                onClick={() => setCanvasOpen(false)}
                className="mt-1 text-xs text-gray-400 hover:text-gray-600"
              >
                캔버스 접기 ▲
              </button>
            </div>
          )}

          {/* Input bar */}
          <div className="flex gap-2 items-end">
            <button
              onClick={() => setCanvasOpen(!canvasOpen)}
              className={`shrink-0 rounded-lg p-3 transition-colors ${
                canvasOpen
                  ? "bg-blue-100 text-blue-600"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              title="그리기"
            >
              ✏️
            </button>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="무엇이든 물어보세요..."
              className="flex-1 rounded-xl border px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none overflow-hidden"
              style={{ minHeight: "48px" }}
              rows={1}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || (!input.trim() && !(canvasOpen && canvasRef.current && !canvasRef.current.isEmpty()))}
              className="shrink-0 rounded-xl bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              전송
            </button>
          </div>

          {/* Footer: new session button */}
          {messages.length > 0 && (
            <div className="flex justify-center">
              <button
                onClick={startNewSession}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                새 대화 시작하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
