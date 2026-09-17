import { z } from "zod";

export const classificationSchema = z.object({
  sentiment: z.enum(["POS", "NEU", "NEG"]),
  sentimentScore: z.number().min(-1).max(1),
  themes: z.array(z.string().trim().min(1).max(80)).max(5),
  featureArea: z.string().trim().min(1).max(100),
  rationale: z.string().trim().min(1).max(1000),
});

export const groundedAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(5000),
  sourceIds: z.array(z.string()).max(10),
  insufficientEvidence: z.boolean(),
});

export const reportNarrativeSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(5000),
  topThemes: z.array(z.object({ name: z.string(), insight: z.string() })).max(10),
  sentimentShifts: z.array(z.string()).max(10),
  notableQuotes: z.array(z.object({ quote: z.string(), sourceId: z.string() })).max(10),
  recommendedActions: z.array(z.string()).max(10),
  supportingEvidence: z.array(z.string()).max(10),
});

export type Classification = z.infer<typeof classificationSchema>;
export type GroundedAnswer = z.infer<typeof groundedAnswerSchema>;
export type ReportNarrative = z.infer<typeof reportNarrativeSchema>;
