import { z } from "zod";
import { ProvenanceSchema, ValidationSchema } from "./problem";

export const PrerequisiteSchema = z.object({
  concept: z.string(),
  chapterId: z.string(),
  reason: z.string(),
});

export const LessonContentSchema = z.object({
  concept: z.string(),
  explanation: z.string(),
  visualSvg: z.string().nullable(),
  checkQuestion: z.object({
    question: z.string(),
    options: z.array(z.string()),
    correctIndex: z.number().int().min(0),
  }),
  prerequisites: z.array(PrerequisiteSchema).optional(),
});

export const ChapterLessonV2Schema = z.object({
  schema: z.literal("forming-lesson/2.0"),
  chapterId: z.string(),
  chapterTitle: z.string(),
  lessons: z.array(LessonContentSchema),
  provenance: ProvenanceSchema,
  validation: ValidationSchema,
});

export type ChapterLessonV2 = z.infer<typeof ChapterLessonV2Schema>;

export const ChapterLessonV1Schema = z.object({
  chapterId: z.string(),
  chapterTitle: z.string(),
  generatedAt: z.string(),
  lessons: z.array(LessonContentSchema),
});

export type ChapterLessonV1 = z.infer<typeof ChapterLessonV1Schema>;
