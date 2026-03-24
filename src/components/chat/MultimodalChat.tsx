"use client";

import { useRef, useState } from "react";
import DrawingCanvas, {
  type DrawingCanvasAPI,
} from "@/components/canvas/DrawingCanvas";
import { TheoryContent } from "@/components/theory/TheoryContent";
import SvgRenderer from "@/components/ui/SvgRenderer";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string; // thumbnail of user's drawing
}

interface ProblemContext {
  question: string;
  answer: string;
  studentAnswer: string;
  isCorrect: boolean;
  processAnalysis: string;
  weaknesses: string[];
}

interface MultimodalChatProps {
  problemContext?: ProblemContext;
  title?: string;
  subtitle?: string;
}

const QUICK_ACTIONS = [
  { label: "어디서 틀렸는지 알려주세요", icon: "❓" },
  { label: "이 개념 다시 설명해주세요", icon: "📖" },
  { label: "비슷한 문제 풀이 방법 알려주세요", icon: "💡" },
];

export default function MultimodalChat({
  problemContext,
  title = "AI 튜터에게 질문하기",
  subtitle = "텍스트를 입력하거나, 그려서 질문할 수 있어요",
}: MultimodalChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<DrawingCanvasAPI>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = async (text: string) => {
    if (loading) return;

    const canvas = canvasRef.current;
    const hasDrawing = canvas && !canvas.isEmpty();
    const hasText = text.trim().length > 0;

    // Must have at least one input
    if (!hasDrawing && !hasText) return;

    // Build message text
    const messageText = hasText
      ? text.trim()
      : "(그림으로 질문)";

    // Export canvas if drawing exists
    let canvasImage: string | null = null;
    let imageDataUrl: string | undefined;
    if (hasDrawing && canvas) {
      canvasImage = await canvas.exportAsBase64();
      if (canvasImage) {
        imageDataUrl = `data:image/webp;base64,${canvasImage}`;
      }
    }

    const userMessage: Message = {
      role: "user",
      content: messageText,
      imageDataUrl,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

    // Clear canvas after sending
    if (hasDrawing && canvas) {
      canvas.clear();
    }

    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          problemContext,
          canvasImage,
        }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.content },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "응답을 가져오지 못했습니다. 다시 시도해주세요.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
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
    <div className="rounded-xl border bg-white shadow-sm flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>

      {/* Quick actions */}
      {messages.length === 0 && problemContext && (
        <div className="flex flex-wrap gap-2 px-6 py-4">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.label)}
              disabled={loading}
              className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
            >
              {action.icon} {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages (scrollable, grows to fill) */}
      {messages.length > 0 && (
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
                {" "}답변 작성 중...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input area — fixed at bottom */}
      <div className="border-t px-4 py-4 space-y-3">
        {/* Drawing canvas — always visible */}
        <DrawingCanvas ref={canvasRef} height="200px" compact />

        {/* Text input + send */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            placeholder="질문을 입력하거나, 위에 그려서 전송하세요..."
            className="flex-1 rounded-xl border px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
