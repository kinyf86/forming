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
import { listAllGeneratedProblems, getRuntimeCacheDir } from "@/lib/problems";
import type { Problem } from "@/types";

function saveRuntimeProblem(problem: Problem): void {
  const dir = getRuntimeCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, `${problem.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(problem, null, 2), "utf-8");
}

/** Find a previously-generated problem for this chapter + difficulty
 * that the student has not yet solved. Searches both curated v2 problems
 * and runtime-cache v1 problems via @/lib/problems. */
function findExistingProblem(
  chapterId: string,
  difficulty: number | undefined,
  clientId: string
): Problem | null {
  const candidates = listAllGeneratedProblems().filter(
    (p) => p.topicId === chapterId && (difficulty == null || p.difficulty === difficulty)
  );
  if (candidates.length === 0) return null;

  const submissions = getSubmissions(clientId);
  const solvedIds = new Set<string>(submissions.map((s) => s.problemId));
  const unsolved = candidates.filter((p) => !solvedIds.has(p.id));
  if (unsolved.length === 0) return null;
  return unsolved[Math.floor(Math.random() * unsolved.length)];
}

export async function POST(request: NextRequest) {
  try {
    const { chapterId, difficulty, clientId = "default" } = await request.json();

    // Try DB first - instant response. When difficulty is omitted (e.g.
    // "다음 문제" from result page), search across all difficulties to
    // maximize the cache hit rate.
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
      difficulty: difficulty ?? 1,
      problemId,
      chapterId,
    });

    // DB miss path — generate fresh. Haiku is fast and good enough for
    // worksheet-style problems; quality differences here are dominated
    // by the prompt + Phase B review, not the model tier.
    const response = await askClaude(
      prompt,
      {
        clientId,
        endpoint: "/api/generate-problem",
        sessionId: `gen-${problemId}`,
      },
      "fast"
    );
    const problem = parseJsonFromResponse(response) as Problem;

    // Ensure consistent ID
    problem.id = problemId;

    // Save to runtime cache (gitignored)
    saveRuntimeProblem(problem);

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
