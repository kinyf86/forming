import { z } from "zod";
import { COMBINATION_MODES } from "@/lib/dimensions/registry";

const AxisSourceSchema = z.enum(["ai", "human"]);

function axisValueSchema<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value,
    source: AxisSourceSchema,
    confidence: z.number().min(0).max(1),
  });
}

export const ProblemAxesSchema = z.object({
  "difficulty.orthogonal_concepts": axisValueSchema(z.number().int().min(1).max(5)),
  "difficulty.combination_mode": axisValueSchema(z.enum(COMBINATION_MODES)),
  "cognitive.misconception_tag": axisValueSchema(z.array(z.string())),
});

export const ProvenanceSchema = z.object({
  source_model: z.enum(["opus", "sonnet", "haiku", "gemma", "human", "unknown"]),
  generated_at: z.string(),
  generator: z.string(),
  prompt_version: z.string().optional(),
});

export const ValidationStatusSchema = z.enum([
  "PASS",
  "REVISE",
  "REJECT",
  "NEEDS_HUMAN",
  "UNCHECKED",
]);

export const ValidationScoresSchema = z
  .object({
    math_correctness: z.number().min(1).max(10).optional(),
    grade_appropriateness: z.number().min(1).max(10).optional(),
    trap_quality: z.number().min(1).max(10).optional(),
    korean_naturalness: z.number().min(1).max(10).optional(),
    solvability: z.number().min(1).max(10).optional(),
    curriculum_alignment: z.number().min(1).max(10).optional(),
  })
  .partial();

export const ValidationSchema = z.object({
  status: ValidationStatusSchema,
  scores: ValidationScoresSchema.optional(),
  verdict_at: z.string().optional(),
  validator_model: z.string().optional(),
  report_ref: z.string().optional(),
});

export const ProblemContentSchema = z.object({
  question: z.string(),
  questionImage: z.string().optional(),
  diagram: z.string().optional(),
  hints: z.array(z.string()),
  choices: z.array(z.string()),
  solution: z.string(),
  solutionDiagram: z.string().optional(),
  answer: z.string(),
  concepts: z.array(z.string()),
});

export const ProblemV2Schema = z.object({
  schema: z.literal("forming-problem/2.0"),
  id: z.string(),
  topicId: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  axes: ProblemAxesSchema.optional(),
  content: ProblemContentSchema,
  provenance: ProvenanceSchema,
  validation: ValidationSchema,
});

export type ProblemV2 = z.infer<typeof ProblemV2Schema>;

export const ProblemV1Schema = z.object({
  id: z.string(),
  topicId: z.string(),
  question: z.string(),
  questionImage: z.string().optional(),
  diagram: z.string().optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  hints: z.array(z.string()),
  choices: z.array(z.string()),
  solution: z.string(),
  solutionDiagram: z.string().optional(),
  answer: z.string(),
  concepts: z.array(z.string()),
});

export type ProblemV1 = z.infer<typeof ProblemV1Schema>;

export function isProblemV2(p: unknown): p is ProblemV2 {
  return (
    typeof p === "object" &&
    p !== null &&
    "schema" in p &&
    (p as { schema: unknown }).schema === "forming-problem/2.0"
  );
}

export function v2ToLegacyProblem(p: ProblemV2): ProblemV1 {
  return {
    id: p.id,
    topicId: p.topicId,
    difficulty: p.difficulty,
    question: p.content.question,
    questionImage: p.content.questionImage,
    diagram: p.content.diagram,
    hints: p.content.hints,
    choices: p.content.choices,
    solution: p.content.solution,
    solutionDiagram: p.content.solutionDiagram,
    answer: p.content.answer,
    concepts: p.content.concepts,
  };
}
