export type AxisSource = "ai" | "human";

export interface AxisValue<T> {
  value: T;
  source: AxisSource;
  confidence: number;
}

export type CombinationMode = "single" | "parallel" | "chain" | "mixed";

export interface ProblemAxes {
  "difficulty.orthogonal_concepts": AxisValue<number>;
  "difficulty.combination_mode": AxisValue<CombinationMode>;
  "cognitive.misconception_tag": AxisValue<string[]>;
}

export type AxisName = keyof ProblemAxes;
