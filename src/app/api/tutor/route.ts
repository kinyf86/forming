import { NextRequest, NextResponse } from "next/server";
import { getChapter, getGradeFromChapterId, getAllChapters } from "@/lib/curriculum";
import { getLocale } from "@/lib/locale";
import { askClaude, parseJsonFromResponse } from "@/lib/claude";
import {
  getChapterLesson,
  saveChapterLesson,
  type LessonContent,
  type ChapterLesson,
} from "@/lib/lessons";
import fs from "fs";
import path from "path";

/**
 * GET: 사전 생성된 레슨 조회
 */
export async function GET(request: NextRequest) {
  const chapterId = request.nextUrl.searchParams.get("chapterId");
  if (!chapterId) {
    return NextResponse.json(
      { error: "chapterId가 필요합니다." },
      { status: 400 }
    );
  }

  const lesson = getChapterLesson(chapterId);
  if (!lesson) {
    return NextResponse.json(
      { error: "생성된 수업이 없습니다. POST로 먼저 생성해주세요." },
      { status: 404 }
    );
  }

  return NextResponse.json(lesson);
}

/**
 * POST: 단원 전체 레슨을 사전 생성하여 JSON 파일로 저장
 */
export async function POST(request: NextRequest) {
  try {
    const { chapterId, force = false } = await request.json();

    // 이미 생성된 레슨이 있으면 반환 (force가 아닌 경우)
    if (!force) {
      const existing = getChapterLesson(chapterId);
      if (existing) {
        return NextResponse.json({
          status: "exists",
          message: "이미 생성된 수업이 있습니다.",
          lesson: existing,
        });
      }
    }

    const chapter = getChapter(chapterId);
    if (!chapter) {
      return NextResponse.json(
        { error: "단원을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const grade = getGradeFromChapterId(chapterId);
    const locale = getLocale();
    const lessons: LessonContent[] = [];

    // Load the lesson generation skill prompt
    const skillPath = path.join(process.cwd(), "src/data/prompts/generate-lesson.md");
    const skillPrompt = fs.readFileSync(skillPath, "utf-8");

    // Build curriculum context for prerequisite identification
    const allChapters = getAllChapters();
    const sameSubjectChapters = allChapters
      .filter((ch) => {
        const isMath = chapterId.startsWith("math");
        return isMath ? ch.id.startsWith("math") : ch.id.startsWith("sci");
      })
      .map((ch) => `${ch.id}: ${ch.title} (${ch.concepts.join(", ")})`)
      .join("\n");

    // 각 개념별로 레슨 생성
    for (const concept of chapter.concepts) {
      const prompt = `${skillPrompt}

---

## Context for This Lesson

${locale.tutorPrompt}

- Country: ${locale.country}
- Student: ${locale.gradeLabel(grade)}
- Subject: ${chapterId.startsWith("math") ? "수학" : "과학"}
- Unit: ${chapter.chapter}단원 - ${chapter.title}
- Concept to teach: ${concept}
- All concepts in this unit: ${chapter.concepts.join(", ")}

## Available Curriculum (for prerequisite linking)
${sameSubjectChapters}

Return valid JSON only. No other text.`;

      const response = await askClaude(prompt);
      const result = parseJsonFromResponse(response) as LessonContent;
      lessons.push({ ...result, concept });
    }

    const chapterLesson: ChapterLesson = {
      chapterId,
      chapterTitle: `${chapter.chapter}단원 - ${chapter.title}`,
      generatedAt: new Date().toISOString(),
      lessons,
    };

    saveChapterLesson(chapterLesson);

    return NextResponse.json({
      status: "generated",
      message: `${lessons.length}개 개념 수업이 생성되었습니다.`,
      lesson: chapterLesson,
    });
  } catch (error) {
    console.error("Tutor generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "수업 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
