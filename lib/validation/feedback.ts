import { z } from "zod";

const channelValues = ["SUPPORT_TICKET", "APP_STORE", "NPS_SURVEY", "SALES_CALL", "COMMUNITY"] as const;
const sentimentValues = ["POS", "NEU", "NEG"] as const;
const statusValues = ["NEW", "REVIEWED", "ACTIONED"] as const;

export const feedbackCreateSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  channel: z.enum(channelValues),
  sourceRef: z.string().trim().max(500).optional().nullable(),
  customerLabel: z.string().trim().max(160).optional().nullable(),
  createdAt: z.coerce.date().optional(),
});

export const feedbackUpdateSchema = z.object({
  content: z.string().trim().min(1).max(10_000).optional(),
  sourceRef: z.string().trim().max(500).optional().nullable(),
  customerLabel: z.string().trim().max(160).optional().nullable(),
  status: z.enum(statusValues).optional(),
});

export const feedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(200).optional(),
  channel: z.enum(channelValues).optional(),
  sentiment: z.enum(sentimentValues).optional(),
  status: z.enum(statusValues).optional(),
  themeId: z.string().cuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD").optional(),
  sort: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).superRefine((value, context) => {
  const parseDate = (input: string) => {
    const date = new Date(`${input}T00:00:00.000Z`);
    return date.getUTCFullYear() === Number(input.slice(0, 4)) && date.getUTCMonth() + 1 === Number(input.slice(5, 7)) && date.getUTCDate() === Number(input.slice(8, 10)) ? date : null;
  };
  const start = value.startDate ? parseDate(value.startDate) : null;
  const end = value.endDate ? parseDate(value.endDate) : null;
  if (value.startDate && !start) context.addIssue({ code: "custom", path: ["startDate"], message: "startDate is not a valid calendar date" });
  if (value.endDate && !end) context.addIssue({ code: "custom", path: ["endDate"], message: "endDate is not a valid calendar date" });
  if (start && end && start > end) context.addIssue({ code: "custom", path: ["endDate"], message: "endDate must be on or after startDate" });
});

export const memberRoleSchema = z.object({
  role: z.enum(["ADMIN", "ANALYST", "VIEWER"]),
});

export type FeedbackQuery = z.infer<typeof feedbackQuerySchema>;
