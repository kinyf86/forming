"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Chapter } from "@/lib/curriculum";
import { getClientId } from "@/lib/client-id";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/Breadcrumb";

interface DifficultyOption {
  level: 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

function getDifficultyOptions(grade: number): DifficultyOption[] {
  if (grade <= 6) {
    // Elementary: 2 levels
    return [
      { level: 1, label: "기본 문제", color: "bg-green-600 hover:bg-green-700" },
      { level: 2, label: "심화 문제", color: "bg-blue-600 hover:bg-blue-700" },
    ];
  }
  if (grade <= 9) {
    // Middle school: 3 levels
    return [
      { level: 1, label: "기본 문제", color: "bg-green-600 hover:bg-green-700" },
      { level: 2, label: "응용 문제", color: "bg-blue-600 hover:bg-blue-700" },
      { level: 3, label: "심화 문제", color: "bg-purple-600 hover:bg-purple-700" },
    ];
  }
  // High school: 4 levels
  return [
    { level: 1, label: "기본 문제", color: "bg-green-600 hover:bg-green-700" },
    { level: 2, label: "응용 문제", color: "bg-blue-600 hover:bg-blue-700" },
    { level: 3, label: "심화 문제", color: "bg-purple-600 hover:bg-purple-700" },
    { level: 4, label: "도전 문제", color: "bg-orange-600 hover:bg-orange-700" },
  ];
}

interface ChapterClientProps {
  chapter: Chapter;
  subject: string;
  grade: number;
  breadcrumb: BreadcrumbItem[];
}

export function ChapterClient({ chapter, subject, grade, breadcrumb }: ChapterClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateProblem = async (difficulty: 1 | 2 | 3 | 4) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: chapter.id, difficulty, clientId: getClientId() }),
      });

      if (!res.ok) throw new Error("문제 생성에 실패했습니다.");

      const problem = await res.json();

      // Save generated problem to sessionStorage
      sessionStorage.setItem(`problem-${problem.id}`, JSON.stringify(problem));
      router.push(`/problem/${problem.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Breadcrumb items={breadcrumb} />

      <div className="rounded-xl border bg-white p-8 shadow-sm">
        <span
          className={`mb-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${
            subject === "수학"
              ? "bg-blue-100 text-blue-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {subject} · {chapter.chapter}단원
        </span>
        <h1 className="mt-2 text-2xl font-bold">{chapter.title}</h1>

        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">학습 개념</h2>
          <ul className="space-y-2">
            {chapter.concepts.map((concept, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-gray-700"
              >
                <span className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full bg-gray-100 text-center text-xs leading-5 text-gray-500">
                  {i + 1}
                </span>
                {concept}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* AI 튜터 수업 버튼 */}
      <div className="mt-6">
        <button
          onClick={() => router.push(`/tutor/${chapter.id}`)}
          className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-5 text-lg font-bold text-white hover:from-blue-600 hover:to-indigo-600 transition-all shadow-md hover:shadow-lg"
        >
          AI 튜터 수업 시작하기
          <span className="block text-sm font-normal text-blue-100 mt-1">
            {chapter.concepts.length}개 개념을 시각적으로 배워요
          </span>
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className={`mt-8 grid gap-3 ${getDifficultyOptions(grade).length <= 2 ? "sm:grid-cols-2" : getDifficultyOptions(grade).length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        {getDifficultyOptions(grade).map((opt) => (
          <button
            key={opt.level}
            onClick={() => handleGenerateProblem(opt.level)}
            disabled={loading}
            className={`rounded-lg px-6 py-4 text-lg font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${opt.color}`}
          >
            {loading ? "생성 중..." : opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
