import assert from "node:assert/strict";
import test from "node:test";
import { calculateNewThisWeek, calculateSentiment, calculateThemes, calculateVolume, dashboardQuerySchema, getDashboardData } from "@/lib/analytics/dashboard";

const rows = [
  { createdAt: new Date("2026-09-15T10:00:00Z"), sentiment: "NEG" as const, themes: [{ theme: { name: "Onboarding" } }] },
  { createdAt: new Date("2026-09-16T10:00:00Z"), sentiment: "POS" as const, themes: [{ theme: { name: "Performance" } }, { theme: { name: "Onboarding" } }] },
  { createdAt: new Date("2026-08-20T10:00:00Z"), sentiment: null, themes: [] },
];

test("dashboard validation accepts calendar ranges and rejects invalid or reversed dates", () => {
  assert.equal(dashboardQuerySchema.safeParse({ start: "2026-09-01", end: "2026-09-30" }).success, true);
  assert.equal(dashboardQuerySchema.safeParse({ start: "2026-02-30", end: "2026-03-01" }).success, false);
  assert.equal(dashboardQuerySchema.safeParse({ start: "2026-10-01", end: "2026-09-01" }).success, false);
});

test("dashboard aggregation calculates volume, sentiment, and themes", () => {
  const range = { start: new Date("2026-09-15T00:00:00Z"), end: new Date("2026-09-16T00:00:00Z") };
  assert.deepEqual(calculateVolume(rows, range).points, [{ label: "2026-09-15", count: 1 }, { label: "2026-09-16", count: 1 }]);
  assert.deepEqual(calculateSentiment(rows), [{ sentiment: "POS", count: 1 }, { sentiment: "NEU", count: 0 }, { sentiment: "NEG", count: 1 }]);
  assert.deepEqual(calculateThemes(rows), [{ name: "Onboarding", count: 2 }, { name: "Performance", count: 1 }]);
});

test("dashboard data applies workspace scope and calculates KPIs", async () => {
  const calls: Array<{ where: unknown; operation: string }> = [];
  const client = { feedback: { findMany: async ({ where }: { where: unknown }) => { calls.push({ where, operation: "findMany" }); return rows; }, count: async ({ where }: { where: unknown }) => { calls.push({ where, operation: "count" }); return 4; } } } as never;
  const result = await getDashboardData("workspace-a", { start: new Date("2026-09-15T00:00:00Z"), end: new Date("2026-09-16T00:00:00Z") }, client, new Date("2026-09-17T12:00:00Z"));
  assert.equal(result.totalItems, 3); assert.equal(result.negativePercentage, 50); assert.equal(result.newThisWeek, 4); assert.equal((calls[0].where as { workspaceId: string }).workspaceId, "workspace-a");
});

test("new-this-week uses UTC calendar week and empty data has no negative percentage", async () => {
  assert.equal(calculateNewThisWeek(rows, new Date("2026-09-17T12:00:00Z")), 2);
  const client = { feedback: { findMany: async () => [], count: async () => 0 } } as never;
  const result = await getDashboardData("workspace-a", { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-09-30T00:00:00Z") }, client, new Date("2026-09-17T12:00:00Z"));
  assert.equal(result.totalItems, 0); assert.equal(result.negativePercentage, null); assert.equal(result.volume.points.every((point) => point.count === 0), true);
});
