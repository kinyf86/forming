import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/claude";
import { PathTraversalError } from "@/lib/sanitize";
import { findProblemFile } from "@/lib/problems";

export async function POST(request: NextRequest) {
  try {
    const { problemId, question, clientId = "default" } = await request.json();

    const prompt = `아래 수학 문제에 필요한 도형을 SVG로 그려주세요.

## 문제
${question}

## SVG 규칙
- viewBox="0 0 400 300" 사용
- 한글 텍스트는 font-family="sans-serif"
- 도형 선: stroke="#333" stroke-width="2", 보조선: stroke="#999" stroke-dasharray="5,3"
- 강조: #2563eb(파란), 각도: #dc2626(빨간)
- 텍스트: font-size="14", 꼭짓점 이름 font-size="16" bold
- 배경: rect fill="#f9fafb"

SVG 코드만 출력하세요. 설명 없이 <svg>...</svg> 만 출력하세요.`;

    const response = await askClaude(prompt, {
      clientId,
      endpoint: "/api/generate-diagram",
      sessionId: `diagram-${problemId}`,
    });

    // Extract SVG from response
    let svg = response.trim();
    const svgMatch = svg.match(/<svg[\s\S]*<\/svg>/);
    if (svgMatch) {
      svg = svgMatch[0];
    }

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
