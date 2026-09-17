import { z } from "zod";

export const askSchema = z.object({ question: z.string().trim().min(3).max(1000) });

export const reportRequestSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
}).refine((value) => value.periodStart < value.periodEnd, { message: "periodStart must be before periodEnd" });

export const dateRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
}).refine((value) => value.start < value.end, { message: "start must be before end" });
