"use client";

import { useRouter } from "next/navigation";
import TutorLesson from "@/components/tutor/TutorLesson";
import MultimodalChat from "@/components/chat/MultimodalChat";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import type { LessonContent } from "@/lib/lessons";

interface TutorClientProps {
  chapterId: string;
  chapterTitle: string;
  concepts: string[];
  lessons: LessonContent[];
}

export default function TutorClient({
  chapterId,
  chapterTitle,
  concepts,
  lessons,
}: TutorClientProps) {
  const router = useRouter();

  const handleComplete = () => {
    router.push(`/chapter/${chapterId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Breadcrumb
          items={[
            { label: "홈", href: "/" },
            { label: chapterTitle, href: `/chapter/${chapterId}` },
            { label: "수업" },
          ]}
        />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            AI 튜터 수업
          </h1>
          <p className="text-gray-500">
            {chapterTitle} — {concepts.length}개 개념을 배워봐요
          </p>
        </div>

        <TutorLesson
          chapterTitle={chapterTitle}
          concepts={concepts}
          lessons={lessons}
          onComplete={handleComplete}
        />

        {/* AI tutor chat */}
        <div className="mt-8">
          <MultimodalChat
            title="궁금한 점이 있나요?"
            subtitle="수업 내용에 대해 그려서 또는 텍스트로 질문할 수 있어요"
          />
        </div>
      </div>
    </div>
  );
}
