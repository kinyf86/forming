export interface Topic {
  id: string;
  title: string;
  subject: "math" | "science";
  grade: number;
  theoryFile: string;
  problemIds: string[];
}

export interface Problem {
  id: string;
  topicId: string;
  question: string;
  questionImage?: string;
  difficulty: 1 | 2 | 3;
  hints: string[];
  solution: string;
  answer: string;
  concepts: string[];
}

export interface Submission {
  id: string;
  problemId: string;
  canvasText: string;
  drawingDescription: string;
  finalAnswer: string;
  passed: boolean;
  timestamp: number;
}

export interface AnalysisResult {
  isCorrect: boolean;
  processAnalysis: string;
  correctSolution: string;
  weaknesses: string[];
  encouragement: string;
  nextProblems: NextProblemSuggestion[];
}

export interface NextProblemSuggestion {
  id: string;
  question: string;
  reason: string;
  targetWeakness: string;
  difficulty: 1 | 2 | 3;
}

export interface LearningSession {
  currentTopicId: string;
  submissions: Submission[];
  analysisResults: Record<string, AnalysisResult>;
  generatedProblems: Problem[];
}
