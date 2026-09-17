import assert from "node:assert/strict";
import test from "node:test";
import { feedbackQuerySchema } from "@/lib/validation/feedback";
import { listFeedback, type Database } from "@/lib/feedback/service";

const themeId = "cmj1q2w3e4r5t6y7u8i9o0p1a";

function captureDatabase(calls: Array<{ where: unknown; options: unknown }>): Database {
  return { feedback: {
    findMany: async (options: unknown) => { calls.push({ where: (options as { where: unknown }).where, options }); return []; },
    count: async (options: unknown) => { calls.push({ where: (options as { where: unknown }).where, options }); return 0; },
  } } as unknown as Database;
}

test("Inbox query validates filters and rejects invalid dates or reversed ranges", () => {
  const valid = feedbackQuerySchema.safeParse({ themeId, startDate: "2026-09-01", endDate: "2026-09-30", channel: "COMMUNITY", sentiment: "NEG", status: "NEW", sort: "updatedAt", direction: "asc" });
  assert.equal(valid.success, true);
  assert.equal(feedbackQuerySchema.safeParse({ startDate: "2026-02-30" }).success, false);
  assert.equal(feedbackQuerySchema.safeParse({ startDate: "2026-10-01", endDate: "2026-09-01" }).success, false);
  assert.equal(feedbackQuerySchema.safeParse({ themeId: "not-a-cuid" }).success, false);
});

test("listFeedback applies combined filters, tenant-scoped theme, inclusive date range, sorting, and pagination to both queries", async () => {
  const calls: Array<{ where: unknown; options: unknown }> = [];
  const result = await listFeedback("workspace-a", { page: 2, pageSize: 10, search: "onboard", channel: "COMMUNITY", sentiment: "NEG", status: "NEW", themeId, startDate: "2026-09-01", endDate: "2026-09-30", sort: "updatedAt", direction: "asc" }, captureDatabase(calls));
  const where = calls[0].where as { workspaceId: string; content: unknown; channel: string; sentiment: string; status: string; themes: { some: { themeId: string; workspaceId: string } }; createdAt: { gte: Date; lt: Date } };
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.pageSize, 10);
  assert.equal(calls.length, 2);
  assert.equal(where.workspaceId, "workspace-a");
  assert.deepEqual(where.content, { contains: "onboard", mode: "insensitive" });
  assert.equal(where.channel, "COMMUNITY");
  assert.equal(where.sentiment, "NEG");
  assert.equal(where.status, "NEW");
  assert.deepEqual(where.themes.some, { themeId, workspaceId: "workspace-a" });
  assert.equal(where.createdAt.gte.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(where.createdAt.lt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.deepEqual((calls[0].options as { orderBy: unknown }).orderBy, { updatedAt: "asc" });
});

test("same-day date filters include the full selected calendar day", async () => {
  const calls: Array<{ where: unknown; options: unknown }> = [];
  await listFeedback("workspace-a", { page: 1, pageSize: 20, sort: "createdAt", direction: "desc", startDate: "2026-09-17", endDate: "2026-09-17" }, captureDatabase(calls));
  const where = calls[0].where as { createdAt: { gte: Date; lt: Date } };
  assert.equal(where.createdAt.gte.toISOString(), "2026-09-17T00:00:00.000Z");
  assert.equal(where.createdAt.lt.toISOString(), "2026-09-18T00:00:00.000Z");
});
