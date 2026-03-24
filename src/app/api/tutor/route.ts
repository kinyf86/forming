import { NextRequest, NextResponse } from "next/server";
import { getChapter, getGradeFromChapterId } from "@/lib/curriculum";
import { getLocale } from "@/lib/locale";
import { askClaude, parseJsonFromResponse } from "@/lib/claude";
import {
  getChapterLesson,
  saveChapterLesson,
  type LessonContent,
  type ChapterLesson,
} from "@/lib/lessons";

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

    // 각 개념별로 레슨 생성
    for (const concept of chapter.concepts) {
      const prompt = `당신은 ${locale.country} ${locale.gradeLabel(grade)} 학생을 가르치는 수학/과학 튜터입니다.
${locale.tutorPrompt}

## 수업 주제
- 단원: ${chapter.chapter}단원 - ${chapter.title}
- 개념: ${concept}
- 학생 수준: 이 개념을 처음 배우는 ${locale.gradeLabel(grade)} 학생

## 요청사항
아래 3가지를 JSON으로 응답해주세요.

1. **explanation**: 이 개념을 쉽게 설명하는 마크다운 텍스트 (3-5문장). 일상 생활 예시를 포함하세요. LaTeX 수식($...$)을 사용하세요.

2. **visualSvg**: 이 개념을 시각적으로 설명하는 완전한 SVG 코드.
   - 반드시 <svg viewBox="0 0 500 300" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"> 로 시작
   - 모든 텍스트는 text-anchor="middle" 사용
   - 분수 표기 시 분자/분모 간격 24px 고정, 분수선은 분자/분모 사이 정중앙
   - 색상: 주요 요소는 #4A90D9(파란), 보조 #5CB85C(초록), 강조 #E67E22(주황)
   - 한국어 레이블 사용
   - 외부 참조 금지
   - 이 개념을 시각적으로 이해할 수 있는 다이어그램, 차트, 또는 도형을 그려주세요

3. **checkQuestion**: 학생이 이해했는지 확인하는 객관식 문제
   - question: 질문 텍스트
   - options: 2-4개 보기 배열
   - correctIndex: 정답 보기의 인덱스 (0부터 시작)

반드시 유효한 JSON만 출력하세요. 다른 텍스트 없이 JSON만 출력하세요.

{
  "explanation": "마크다운 설명",
  "visualSvg": "<svg ...>...</svg>",
  "checkQuestion": {
    "question": "질문",
    "options": ["보기1", "보기2", "보기3"],
    "correctIndex": 0
  }
}`;

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
