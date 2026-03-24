"use client";

import { useRef, useState } from "react";
import { TheoryContent } from "@/components/theory/TheoryContent";
import SvgRenderer from "@/components/ui/SvgRenderer";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ProblemContext {
  question: string;
  answer: string;
  studentAnswer: string;
  isCorrect: boolean;
  processAnalysis: string;
  weaknesses: string[];
}

interface FeedbackChatProps {
  problemContext: ProblemContext;
}

const QUICK_ACTIONS = [
  { label: "어디서 틀렸는지 알려주세요", icon: "?" },
  { label: "이 개념 다시 설명해주세요", icon: "📖" },
  { label: "비슷한 문제 풀이 방법 알려주세요", icon: "💡" },
];

export function FeedbackChat({ problemContext }: FeedbackChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          problemContext,
        }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.content }]);
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

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">AI 튜터에게 질문하기</h2>
        <p className="text-sm text-gray-500">
          풀이과정에 대해 궁금한 점을 물어보세요
        </p>
      </div>

      {/* Quick action buttons */}
      {messages.length === 0 && (
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

      {/* Messages */}
      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-96 overflow-y-auto px-6 py-4 space-y-4"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {msg.role === "assistant" ? (
                  <>
                    {/* Render SVG blocks from AI response */}
                    {msg.content.includes("<svg") ? (
                      <>
                        {msg.content.split(/(<svg[\s\S]*?<\/svg>)/g).map((part, j) =>
                          part.startsWith("<svg") ? (
                            <SvgRenderer key={j} svg={part} className="my-3" />
                          ) : part.trim() ? (
                            <TheoryContent key={j} content={part} />
                          ) : null
                        )}
                      </>
                    ) : (
                      <TheoryContent content={msg.content} />
                    )}
                  </>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-500">
                답변 작성 중...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="border-t px-6 py-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            placeholder="질문을 입력하세요..."
            className="flex-1 rounded-lg border px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
