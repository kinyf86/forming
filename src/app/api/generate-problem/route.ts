import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getChapter, getConceptAxes, getGradeFromChapterId } from "@/lib/curriculum";
import { getLocale } from "@/lib/locale";
import { askClaude, parseJsonFromResponse } from "@/lib/claude";
import { appendRecord, getSubmissions } from "@/lib/history";
import { loadPrompt } from "@/lib/prompt-loader";
import { PathTraversalError } from "@/lib/sanitize";
import type { Problem } from "@/types";

const GENERATED_DIR = path.join(process.cwd(), "src/data/generated");

function saveGeneratedProblem(problem: Problem): void {
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }
  const filePath = path.join(GENERATED_DIR, `${problem.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(problem, null, 2), "utf-8");
}

/** DB에서 해당 단원 + 난이도에 맞는 미풀이 문제를 랜덤으로 찾기 */
function findExistingProblem(
  chapterId: string,
  difficulty: number,
  clientId: string
): Problem | null {
  if (!fs.existsSync(GENERATED_DIR)) return null;

  // Load all problems for this chapter + difficulty
  const candidates: Problem[] = [];
  for (const file of fs.readdirSync(GENERATED_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const p = JSON.parse(
        fs.readFileSync(path.join(GENERATED_DIR, file), "utf-8")
      ) as Problem;
      if (p.topicId === chapterId && p.difficulty === difficulty) {
        candidates.push(p);
      }
    } catch {
      // skip
    }
  }

  if (candidates.length === 0) return null;

  // Check which ones the student already solved
  const submissions = getSubmissions(clientId);
  const solvedIds = new Set<string>(submissions.map((s) => s.problemId));

  // Filter out already solved
  const unsolved = candidates.filter((p) => !solvedIds.has(p.id));
  if (unsolved.length === 0) return null;

  // Random pick
  return unsolved[Math.floor(Math.random() * unsolved.length)];
}

export async function POST(request: NextRequest) {
  try {
    const { chapterId, difficulty = 1, clientId = "default" } = await request.json();

    // Try DB first - instant response
    const existing = findExistingProblem(chapterId, difficulty, clientId);
    if (existing) {
      return NextResponse.json(existing);
    }

    // No unsolved problem in DB - generate new one
    const chapter = getChapter(chapterId);
    if (!chapter) {
      return NextResponse.json(
        { error: "단원을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const subject = chapterId.startsWith("math") ? "수학" : "과학";
    const grade = getGradeFromChapterId(chapterId);
    const locale = getLocale();
    const problemId = `gen-${randomUUID().slice(0, 8)}`;
    const conceptAxes = getConceptAxes(chapterId);

    const prompt = loadPrompt("generate-problem", {
      country: locale.country,
      gradeLabel: locale.gradeLabel(grade),
      subject,
      tutorPrompt: locale.tutorPrompt,
      conceptAxes,
      difficulty,
      problemId,
      chapterId,
    });

    const response = await askClaude(prompt, {
      clientId,
      endpoint: "/api/generate-problem",
      sessionId: `gen-${problemId}`,
    });
    const problem = parseJsonFromResponse(response) as Problem;

    // Ensure consistent ID
    problem.id = problemId;

    // Save to file
    saveGeneratedProblem(problem);

    // Save generation history
    appendRecord(clientId, {
      type: "problem_generated",
      id: `hist-${problemId}`,
      timestamp: Date.now(),
      problemId: problem.id,
      chapterId,
      difficulty: problem.difficulty,
      question: problem.question,
      choices: problem.choices || [],
      answer: problem.answer,
      solution: problem.solution,
      concepts: problem.concepts,
    });

    return NextResponse.json(problem);
  } catch (error) {
    if (error instanceof PathTraversalError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    console.error("Problem generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "문제 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
