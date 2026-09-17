import { db } from "@/lib/db";

const SPIKE_MULTIPLIER = 1.5;
const MIN_NEW_PERIOD_COUNT = 3;

export async function calculateThemeTrends(workspaceId: string, start: Date, end: Date) {
  const duration = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - duration);
  const rows = await db.feedbackTheme.findMany({ where: { workspaceId, feedback: { workspaceId, createdAt: { gte: previousStart, lte: end } } }, select: { themeId: true, theme: { select: { name: true, color: true } }, feedback: { select: { createdAt: true } } } });
  const grouped = new Map<string, { name: string; color: string; current: number; previous: number }>();
  for (const row of rows) {
    const item = grouped.get(row.themeId) ?? { name: row.theme.name, color: row.theme.color, current: 0, previous: 0 };
    if (row.feedback.createdAt >= start) item.current += 1;
    else item.previous += 1;
    grouped.set(row.themeId, item);
  }
  return Array.from(grouped.entries()).map(([themeId, item]) => ({ themeId, ...item, delta: item.current - item.previous, percentageChange: item.previous === 0 ? (item.current > 0 ? null : 0) : ((item.current - item.previous) / item.previous) * 100, spike: item.previous === 0 ? item.current >= MIN_NEW_PERIOD_COUNT : item.current >= item.previous * SPIKE_MULTIPLIER }));
}
