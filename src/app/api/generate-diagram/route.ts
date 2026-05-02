import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/claude";
import { sanitizePathSegment, assertWithinBase, PathTraversalError } from "@/lib/sanitize";

const GENERATED_DIR = path.join(process.cwd(), "src/data/generated");

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

    // Save to problem file if it exists
    const safeProblemId = sanitizePathSegment(problemId);
    const filePath = path.join(GENERATED_DIR, `${safeProblemId}.json`);
    assertWithinBase(filePath, GENERATED_DIR);
    if (fs.existsSync(filePath)) {
      const problem = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      problem.diagram = svg;
      fs.writeFileSync(filePath, JSON.stringify(problem, null, 2), "utf-8");
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
