import type { Problem } from "@/types";
import { buildCurriculumContext, getGradeFromChapterId } from "@/lib/curriculum";
import { getLocale } from "@/lib/locale";

export function buildAnalysisPrompt(params: {
  problem: Problem;
  canvasText: string;
  drawingDescription: string;
  finalAnswer: string;
  passed: boolean;
  hasImage?: boolean;
  curriculumChapterId?: string;
}): string {
  const { problem, canvasText, drawingDescription, finalAnswer, passed, hasImage, curriculumChapterId } =
    params;

  const grade = getGradeFromChapterId(problem.topicId);
  const locale = getLocale();

  const imageNote = hasImage
    ? "\n- 캔버스 이미지: 첨부된 이미지를 확인하세요. 학생이 캔버스에 직접 그린 풀이 과정입니다."
    : "";

  const curriculumContext = curriculumChapterId
    ? buildCurriculumContext(curriculumChapterId) + "\n\n"
    : "";

  return `당신은 ${locale.country} ${locale.gradeLabel(grade)} 학생을 가르치는 수학/과학 튜터입니다.
학생의 풀이를 분석하고 피드백을 제공해주세요.
${hasImage ? "첨부된 이미지는 학생이 캔버스에 직접 작성한 풀이 과정입니다. 이미지를 꼼꼼히 분석해주세요." : ""}

${curriculumContext}## 문제
${problem.question}

## 정답
${problem.answer}

## 정답 풀이
${problem.solution}

## 관련 개념
${problem.concepts.join(", ")}

## 학생의 풀이 정보
- 캔버스 텍스트: ${canvasText || "(작성 없음)"}
- 캔버스 그리기: ${drawingDescription}${imageNote}
- 최종 답: ${finalAnswer || "(미작성)"}
- 패스 여부: ${passed ? "예 (학생이 풀기를 포기함)" : "아니오"}

## 풀이 작성 규칙
- ${locale.gradeLabel(grade)} 수준에 맞게, 한 단계씩 천천히 설명하세요
- ${locale.tutorPrompt}
- 표는 올바른 마크다운 표 형식을 사용하세요
- 수식은 LaTeX($...$)를 사용하세요
- "왜 이렇게 하는지" 이유를 포함하세요

## 요청사항
위 정보를 바탕으로 다음 JSON 형식으로 응답해주세요. 반드시 유효한 JSON만 출력하세요.

{
  "isCorrect": boolean,
  "processAnalysis": "학생의 풀이 과정에 대한 분석 (한국어, 마크다운)",
  "correctSolution": "단계별 정답 풀이 (한국어, LaTeX 수식, 마크다운 표 형식 준수)",
  "weaknesses": ["보완이 필요한 개념1", "개념2"],
  "encouragement": "학생에게 보내는 격려 메시지 (한국어)",
  "nextProblems": [
    {
      "id": "generated-1",
      "question": "추천 문제 1 (한국어, LaTeX 수식 사용 가능)",
      "reason": "이 문제를 추천하는 이유",
      "targetWeakness": "이 문제가 다루는 약점",
      "difficulty": 1
    },
    {
      "id": "generated-2",
      "question": "추천 문제 2",
      "reason": "이 문제를 추천하는 이유",
      "targetWeakness": "이 문제가 다루는 약점",
      "difficulty": 2
    },
    {
      "id": "generated-3",
      "question": "추천 문제 3",
      "reason": "이 문제를 추천하는 이유",
      "targetWeakness": "이 문제가 다루는 약점",
      "difficulty": 2
    }
  ]
}`;
}
