import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/claude";
import { PathTraversalError } from "@/lib/sanitize";
import { findProblemFile } from "@/lib/problems";

const SVG_RULES = `## SVG 규칙
- viewBox="0 0 400 300" 사용
- 한글 텍스트는 font-family="sans-serif"
- 도형 선: stroke="#333" stroke-width="2", 보조선: stroke="#999" stroke-dasharray="5,3"
- 강조: #2563eb(파란), 각도: #dc2626(빨간)
- 텍스트: font-size="14", 꼭짓점 이름 font-size="16" bold
- 배경: rect fill="#f9fafb"

## 입체도형 필수 요건 (직육면체·정육면체·각기둥·원기둥·각뿔·원뿔·구)
- 사선투영(oblique) 또는 등각투영(isometric) — 입체감이 한눈에 보여야 함
- **보이지 않는 뒷면 모서리는 반드시 stroke-dasharray="5,3" 점선으로 그릴 것** (직육면체는 점선 모서리 3개, 정육면체도 동일)
- 꼭짓점 8개(직육면체) 또는 해당 도형의 모든 꼭짓점을 표시
- **치수가 문제에 명시되어 있으면 가로/세로/높이 라벨을 변(edge) 옆에 명시** (예: "가로 12cm", "세로 8cm", "높이 10cm"). 라벨은 해당 변의 중간에 배치하고, 어떤 변을 가리키는지 모호하지 않게.
- 가로(width), 세로(depth), 높이(height) 방향이 학생 시각에서 명확히 구분되어야 함

## 전개도(展開圖)
- 면을 분리해서 펼친 모습으로 그리고, 마주보는 면이나 중요한 면은 같은 색으로 채워(opacity 0.3) 학생이 매칭을 알게 하기

## 단계별 시각화 (선택)
풀이가 여러 단계로 나뉘는 경우, 각 단계를 \`<g class="step">...</g>\` 그룹으로 묶으세요. 자동 fade-in 애니메이션 적용됨.`;

async function generateDraft(question: string, clientId: string, problemId: string): Promise<string> {
  const prompt = `아래 초중고 수학 문제에 필요한 도형을 SVG로 그려주세요. 학생이 한눈에 이해할 수 있어야 합니다.

## 문제
${question}

${SVG_RULES}

SVG 코드만 출력하세요. 설명 없이 <svg>...</svg> 만 출력하세요.`;

  const response = await askClaude(
    prompt,
    {
      clientId,
      endpoint: "/api/generate-diagram",
      sessionId: `diagram-${problemId}`,
    },
    "fast"
  );
  return extractSvg(response);
}

async function critiqueAndFix(
  question: string,
  draftSvg: string,
  clientId: string,
  problemId: string
): Promise<string> {
  const prompt = `아래는 학생용 도형 SVG 초안입니다. 문제 요구사항과 비교해 검토 후, 필요하면 수정된 SVG를 출력하세요.

## 원 문제
${question}

## 초안 SVG
${draftSvg}

${SVG_RULES}

## 검증 체크리스트 (모두 만족해야 함)
1. **입체도형이라면 점선 모서리(보이지 않는 뒷면)가 빠짐없이 그려져 있는가?** 직육면체/정육면체는 점선 3개 필수.
2. **문제에 명시된 치수(가로/세로/높이 등)가 SVG 텍스트로 정확히 라벨링되어 있는가?** 어느 변이 어떤 치수인지 모호함이 없어야 함.
3. **전개도라면 면 구조가 펼쳐진 형태로 명확한가?**
4. **모든 꼭짓점·필수 라벨이 그려져 있는가?**
5. **viewBox 안에 들어가는가?** 잘림이 없어야 함.

## 출력 형식
- 모든 체크 통과 → 초안 SVG를 그대로 출력 (변경 없음)
- 하나라도 미달 → 수정한 SVG 전체를 출력
- 어느 경우든 SVG 코드만 출력. 설명/JSON/마크다운 금지. \`<svg>...</svg>\` 그대로.`;

  try {
    const response = await askClaude(
      prompt,
      {
        clientId,
        endpoint: "/api/generate-diagram:critique",
        sessionId: `diagram-${problemId}`,
      },
      "fast"
    );
    const fixed = extractSvg(response);
    return fixed || draftSvg;
  } catch {
    return draftSvg;
  }
}

function extractSvg(raw: string): string {
  let svg = raw.trim();
  if (svg.startsWith("```")) {
    svg = svg.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
  }
  const match = svg.match(/<svg[\s\S]*<\/svg>/);
  return match ? match[0] : svg;
}

export async function POST(request: NextRequest) {
  try {
    const { problemId, question, clientId = "default", skipCritique = false } = await request.json();

    const draft = await generateDraft(question, clientId, problemId);
    const svg = skipCritique ? draft : await critiqueAndFix(question, draft, clientId, problemId);

    // Persist to whichever location holds this problem (curated v2 or runtime cache)
    const found = findProblemFile(problemId);
    if (found) {
      const problem = JSON.parse(fs.readFileSync(found.path, "utf-8"));
      if (found.isV2) {
        problem.content = { ...problem.content, diagram: svg };
      } else {
        problem.diagram = svg;
      }
      fs.writeFileSync(found.path, JSON.stringify(problem, null, 2), "utf-8");
    }

    return NextResponse.json({ diagram: svg });
  } catch (error) {
    if (error instanceof PathTraversalError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    console.error("Diagram generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "도형 생성 오류" },
      { status: 500 }
    );
  }
}
