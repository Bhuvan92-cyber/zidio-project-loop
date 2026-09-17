import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

const dashboardDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const dashboardQuerySchema = z.object({ start: dashboardDate, end: dashboardDate }).superRefine((value, context) => {
  const parse = (input: string) => {
    const date = new Date(`${input}T00:00:00.000Z`);
    return date.getUTCFullYear() === Number(input.slice(0, 4)) && date.getUTCMonth() + 1 === Number(input.slice(5, 7)) && date.getUTCDate() === Number(input.slice(8, 10)) ? date : null;
  };
  const start = parse(value.start);
  const end = parse(value.end);
  if (!start) context.addIssue({ code: "custom", path: ["start"], message: "start is not a valid calendar date" });
  if (!end) context.addIssue({ code: "custom", path: ["end"], message: "end is not a valid calendar date" });
  if (start && end && start > end) context.addIssue({ code: "custom", path: ["end"], message: "end must be on or after start" });
});

type DashboardRow = { createdAt: Date; sentiment: "POS" | "NEU" | "NEG" | null; themes: Array<{ theme: { name: string } }> };
export type DashboardDatabase = Pick<PrismaClient, "feedback">;
type DateRange = { start: Date; end: Date };

function endExclusive(end: Date) { const result = new Date(end); result.setUTCDate(result.getUTCDate() + 1); return result; }
function weekStartUtc(date: Date) { const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); const day = result.getUTCDay(); result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1)); return result; }
function addBucket(date: Date, bucket: "day" | "week" | "month") { const result = new Date(date); if (bucket === "day") result.setUTCDate(result.getUTCDate() + 1); else if (bucket === "week") result.setUTCDate(result.getUTCDate() + 7); else result.setUTCMonth(result.getUTCMonth() + 1); return result; }
function bucketFor(date: Date, bucket: "day" | "week" | "month") { if (bucket === "day") return date.toISOString().slice(0, 10); if (bucket === "month") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; return weekStartUtc(date).toISOString().slice(0, 10); }
function bucketForRange(range: DateRange): "day" | "week" | "month" { const days = (endExclusive(range.end).getTime() - range.start.getTime()) / 86_400_000; if (days <= 31) return "day"; if (days <= 180) return "week"; return "month"; }

export function calculateVolume(rows: DashboardRow[], range: DateRange) {
  const bucket = bucketForRange(range); const counts = new Map<string, number>();
  for (const row of rows) { const key = bucketFor(row.createdAt, bucket); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const points: Array<{ label: string; count: number }> = [];
  for (let cursor = bucket === "week" ? weekStartUtc(range.start) : new Date(range.start); cursor < endExclusive(range.end); cursor = addBucket(cursor, bucket)) { const label = bucketFor(cursor, bucket); points.push({ label, count: counts.get(label) ?? 0 }); }
  return { bucket, points };
}

export function calculateSentiment(rows: DashboardRow[]) { return (["POS", "NEU", "NEG"] as const).map((sentiment) => ({ sentiment, count: rows.filter((row) => row.sentiment === sentiment).length })); }
export function calculateThemes(rows: DashboardRow[]) { const counts = new Map<string, number>(); for (const row of rows) for (const item of row.themes) counts.set(item.theme.name, (counts.get(item.theme.name) ?? 0) + 1); return Array.from(counts, ([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)).slice(0, 10); }
export function calculateNewThisWeek(rows: DashboardRow[], now = new Date()) { const start = weekStartUtc(now); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7); return rows.filter((row) => row.createdAt >= start && row.createdAt < end).length; }

export async function getDashboardData(workspaceId: string, range: DateRange, client: DashboardDatabase = db, now = new Date()) {
  const rows = await client.feedback.findMany({ where: { workspaceId, createdAt: { gte: range.start, lt: endExclusive(range.end) } }, select: { createdAt: true, sentiment: true, themes: { select: { theme: { select: { name: true } } } } } }) as DashboardRow[];
  const newThisWeek = calculateNewThisWeek(rows, now);
  const weekStart = weekStartUtc(now); const nextWeek = new Date(weekStart); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const scopedNewThisWeek = range.start <= weekStart && endExclusive(range.end) >= nextWeek ? newThisWeek : await client.feedback.count({ where: { workspaceId, createdAt: { gte: weekStart, lt: nextWeek } } });
  const classified = rows.filter((row) => row.sentiment !== null);
  const negativeCount = rows.filter((row) => row.sentiment === "NEG").length;
  return { range: { start: range.start.toISOString(), end: range.end.toISOString() }, totalItems: rows.length, negativePercentage: classified.length === 0 ? null : (negativeCount / classified.length) * 100, newThisWeek: scopedNewThisWeek, volume: calculateVolume(rows, range), sentiment: calculateSentiment(rows), topThemes: calculateThemes(rows) };
}
