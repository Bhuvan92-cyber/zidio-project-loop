import { db } from "@/lib/db";
import { aiProvider } from "@/lib/ai/provider";
import { reportNarrativeSchema, type ReportNarrative } from "@/lib/ai/schemas";
import { reportSystem } from "@/lib/ai/prompts";

export async function calculateReportFacts(workspaceId: string, periodStart: Date, periodEnd: Date) {
  const duration = periodEnd.getTime() - periodStart.getTime();
  const previousStart = new Date(periodStart.getTime() - duration);
  const previousEnd = periodStart;
  const [feedback, previousFeedback] = await Promise.all([
    db.feedback.findMany({ where: { workspaceId, createdAt: { gte: periodStart, lte: periodEnd } }, select: { id: true, content: true, sentiment: true, themes: { select: { confidence: true, theme: { select: { name: true } } } } }, take: 10_000 }),
    db.feedback.findMany({ where: { workspaceId, createdAt: { gte: previousStart, lt: previousEnd } }, select: { sentiment: true, themes: { select: { theme: { select: { name: true } } } } }, take: 10_000 }),
  ]);
  const countThemes = (rows: typeof feedback) => rows.flatMap((row) => row.themes.map((item) => item.theme.name)).reduce<Record<string, number>>((counts, name) => ({ ...counts, [name]: (counts[name] ?? 0) + 1 }), {});
  const sentimentBreakdown = feedback.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.sentiment ?? "UNCLASSIFIED"]: (counts[row.sentiment ?? "UNCLASSIFIED"] ?? 0) + 1 }), {});
  const previousSentimentBreakdown = previousFeedback.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.sentiment ?? "UNCLASSIFIED"]: (counts[row.sentiment ?? "UNCLASSIFIED"] ?? 0) + 1 }), {});
  return { periodStart, periodEnd, comparisonPeriod: { start: previousStart, end: previousEnd }, totalFeedback: feedback.length, themeCounts: countThemes(feedback), previousThemeCounts: countThemes(previousFeedback as typeof feedback), sentimentBreakdown, previousSentimentBreakdown, representativeFeedback: feedback.map(({ id, content }) => ({ id, content })) };
}

export async function generateReport(workspaceId: string, generatedBy: string, periodStart: Date, periodEnd: Date): Promise<{ id: string; narrative: ReportNarrative }> {
  const facts = await calculateReportFacts(workspaceId, periodStart, periodEnd);
  const narrative = await aiProvider.complete({ system: reportSystem, user: JSON.stringify(facts), schema: reportNarrativeSchema });
  const sourceIds = new Set(facts.representativeFeedback.map((item) => item.id));
  const safeNarrative = { ...narrative, notableQuotes: narrative.notableQuotes.filter((item) => sourceIds.has(item.sourceId)) };
  const report = await db.report.create({ data: { title: `Voice of Customer: ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`, periodStart, periodEnd, contentJson: safeNarrative, workspaceId, generatedBy } });
  return { id: report.id, narrative: safeNarrative };
}

export function listReports(workspaceId: string) {
  return db.report.findMany({ where: { workspaceId }, select: { id: true, title: true, periodStart: true, periodEnd: true, createdAt: true }, orderBy: { createdAt: "desc" } });
}

export function getReport(workspaceId: string, reportId: string) {
  return db.report.findFirst({ where: { id: reportId, workspaceId }, select: { id: true, title: true, periodStart: true, periodEnd: true, contentJson: true, createdAt: true, generatedBy: true } });
}
