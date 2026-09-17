import Papa from "papaparse";
import { z } from "zod";
import type { FeedbackChannel } from "@prisma/client";
import type { FeedbackCreateInput } from "@/lib/feedback/service";
import { feedbackCreateSchema } from "@/lib/validation/feedback";

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 500;
export const CSV_REQUIRED_HEADERS = ["content", "channel", "created_at"] as const;
export const CSV_OPTIONAL_HEADERS = ["customer_label"] as const;

const channelSchema = z.enum(["SUPPORT_TICKET", "APP_STORE", "NPS_SURVEY", "SALES_CALL", "COMMUNITY"]);
const rawRowSchema = z.object({
  content: z.string(),
  channel: z.string(),
  created_at: z.string(),
  customer_label: z.string().optional(),
});

export type CsvRowError = { row: number; message: string };
export type CsvImportResult = { rows: FeedbackCreateInput[]; errors: CsvRowError[] };

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function parseCreatedAt(value: string) {
  const trimmed = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
    return date;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed)) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseCsvContent(csv: string): CsvImportResult {
  if (!csv.trim()) return { rows: [], errors: [{ row: 1, message: "CSV file is empty." }] };
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy", transformHeader: normalizeHeader });
  const errors: CsvRowError[] = parsed.errors.map((error) => ({ row: (error.row ?? 0) + 2, message: error.message }));
  const headers = parsed.meta.fields ?? [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const allowedHeaders = new Set<string>([...CSV_REQUIRED_HEADERS, ...CSV_OPTIONAL_HEADERS]);
  const duplicateHeaders = normalizedHeaders.filter((header, index) => normalizedHeaders.indexOf(header) !== index);
  const missingHeaders = CSV_REQUIRED_HEADERS.filter((header) => !normalizedHeaders.includes(header));
  const unexpectedHeaders = normalizedHeaders.filter((header) => !allowedHeaders.has(header));
  if (duplicateHeaders.length > 0) errors.push({ row: 1, message: `Duplicate CSV header: ${duplicateHeaders[0]}.` });
  if (missingHeaders.length > 0) errors.push({ row: 1, message: `Missing required CSV header: ${missingHeaders.join(", ")}.` });
  if (unexpectedHeaders.length > 0) errors.push({ row: 1, message: `Unexpected CSV header: ${unexpectedHeaders[0]}.` });
  if (errors.length > 0) return { rows: [], errors };
  if (parsed.data.length === 0) return { rows: [], errors: [{ row: 2, message: "CSV contains headers but no data rows." }] };
  if (parsed.data.length > CSV_MAX_ROWS) return { rows: [], errors: [{ row: 0, message: `CSV exceeds the ${CSV_MAX_ROWS}-row limit.` }] };

  const rows: FeedbackCreateInput[] = [];
  parsed.data.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const raw = rawRowSchema.safeParse(rawRow);
    if (!raw.success) {
      errors.push({ row: rowNumber, message: "CSV row has an invalid shape." });
      return;
    }
    const content = raw.data.content.trim();
    const channel = raw.data.channel.trim().toUpperCase().replace(/[\s-]+/g, "_");
    const createdAt = parseCreatedAt(raw.data.created_at);
    const customerLabel = raw.data.customer_label?.trim() || null;
    const parsedChannel = channelSchema.safeParse(channel);
    const parsedCustomerLabel = feedbackCreateSchema.shape.customerLabel.safeParse(customerLabel);
    if (!content) errors.push({ row: rowNumber, message: "content is required." });
    else if (content.length > 10_000) errors.push({ row: rowNumber, message: "content exceeds the 10,000 character limit." });
    if (!parsedChannel.success) errors.push({ row: rowNumber, message: "channel is unsupported." });
    if (!createdAt) errors.push({ row: rowNumber, message: "created_at must be an ISO date or ISO timestamp." });
    if (!parsedCustomerLabel.success) errors.push({ row: rowNumber, message: "customer_label exceeds the 160 character limit." });
    if (content && content.length <= 10_000 && parsedChannel.success && createdAt && parsedCustomerLabel.success) {
      rows.push({ content, channel: parsedChannel.data as FeedbackChannel, customerLabel: parsedCustomerLabel.data, createdAt });
    }
  });
  return errors.length > 0 ? { rows: [], errors } : { rows, errors };
}
