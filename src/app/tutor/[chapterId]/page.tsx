import { getChapter } from "@/lib/curriculum";
import { getChapterLesson } from "@/lib/lessons";
import { notFound } from "next/navigation";
import TutorClient from "./TutorClient";

interface PageProps {
  params: Promise<{ chapterId: string }>;
}

export default async function TutorPage({ params }: PageProps) {
  const { chapterId } = await params;
  const chapter = getChapter(chapterId);

  if (!chapter) {
    notFound();
  }

  const lesson = getChapterLesson(chapterId);

  if (!lesson) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl shadow-sm border p-12 max-w-md">
          <p className="text-4xl mb-4">📚</p>
          <h1 className="text-2xl font-bold text-gray-800 mb-3">
            수업이 아직 준비되지 않았어요
          </h1>
          <p className="text-gray-500 mb-6">
            이 단원의 수업 콘텐츠를 먼저 생성해야 합니다.
          </p>
          <a
            href={`/chapter/${chapterId}`}
            className="inline-block px-6 py-3 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors"
          >
            단원 페이지로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  const chapterTitle = `${chapter.chapter}단원 - ${chapter.title}`;

  return (
    <TutorClient
      chapterId={chapterId}
      chapterTitle={chapterTitle}
      concepts={chapter.concepts}
      lessons={lesson.lessons}
    />
  );
}
