import type { AxisName, CombinationMode } from "./types";

export interface AxisDefinition {
  type: "int" | "enum" | "list[str]";
  description: string;
  range?: [number, number];
  enum?: readonly string[];
  inferredBy: "ai";
  usedBy: readonly string[];
}

export const COMBINATION_MODES: readonly CombinationMode[] = [
  "single",
  "parallel",
  "chain",
  "mixed",
] as const;

export const AXIS_REGISTRY: Record<AxisName, AxisDefinition> = {
  "difficulty.orthogonal_concepts": {
    type: "int",
    range: [1, 5],
    description:
      "독립 개념 축의 갯수. 축 1개=Level1, 2개=Level2, 3+개=Level3+.",
    inferredBy: "ai",
    usedBy: ["phase_b_review.solvability_persona", "phase_d_student_memory"],
  },
  "difficulty.combination_mode": {
    type: "enum",
    enum: COMBINATION_MODES,
    description:
      "single: 1개 개념. parallel: 독립 병렬. chain: A→B→C 연쇄. mixed: 병렬+연쇄. 초등은 chain까지만, 중등 이상 mixed 허용.",
    inferredBy: "ai",
    usedBy: ["phase_b_review.trap_persona", "phase_d_student_memory"],
  },
  "cognitive.misconception_tag": {
    type: "list[str]",
    description:
      "open vocabulary. 이 문제가 노출하려는 (또는 학생이 보유한) 오개념 패턴. 예: 'even_number_is_not_prime', 'sign_loss_in_subtraction'. Phase D student memory와 problem이 cross-link되는 핵심 axis.",
    inferredBy: "ai",
    usedBy: [
      "phase_b_review.curriculum_persona",
      "phase_d_student_memory",
    ],
  },
};

export const AXIS_NAMES = Object.keys(AXIS_REGISTRY) as AxisName[];
