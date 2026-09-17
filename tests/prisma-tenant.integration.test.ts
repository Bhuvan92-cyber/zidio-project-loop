import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, Role, FeedbackStatus, FeedbackChannel } from "@prisma/client";
import { getFeedback, updateFeedback, deleteFeedback } from "@/lib/feedback/service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? test : test.skip;

integration("real Prisma tenant isolation protects independent workspaces", async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = Date.now().toString();
  const workspaceA = await db.workspace.create({ data: { name: `Tenant A ${suffix}` } });
  const workspaceB = await db.workspace.create({ data: { name: `Tenant B ${suffix}` } });
  const userA = await db.user.create({ data: { name: "Admin A", email: `admin-a-${suffix}@example.test`, passwordHash: "hash-a", role: Role.ADMIN, workspaceId: workspaceA.id } });
  await db.user.create({ data: { name: "Admin B", email: `admin-b-${suffix}@example.test`, passwordHash: "hash-b", role: Role.ADMIN, workspaceId: workspaceB.id } });
  const themeA = await db.theme.create({ data: { name: "Theme A", normalized: `theme-a-${suffix}`, color: "#000000", workspaceId: workspaceA.id } });
  const themeB = await db.theme.create({ data: { name: "Theme B", normalized: `theme-b-${suffix}`, color: "#ffffff", workspaceId: workspaceB.id } });
  const feedbackA = await db.feedback.create({ data: { content: "private A", channel: FeedbackChannel.COMMUNITY, status: FeedbackStatus.NEW, workspaceId: workspaceA.id } });
  const feedbackB = await db.feedback.create({ data: { content: "private B", channel: FeedbackChannel.COMMUNITY, status: FeedbackStatus.NEW, workspaceId: workspaceB.id } });
  await db.feedbackTheme.create({ data: { workspaceId: workspaceA.id, feedbackId: feedbackA.id, themeId: themeA.id, confidence: 1 } });
  await db.feedbackTheme.create({ data: { workspaceId: workspaceB.id, feedbackId: feedbackB.id, themeId: themeB.id, confidence: 1 } });
  const reportA = await db.report.create({ data: { title: "Report A", periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30"), contentJson: {}, workspaceId: workspaceA.id, generatedBy: userA.id } });
  try {
    assert.equal((await getFeedback(workspaceA.id, feedbackA.id, db))?.id, feedbackA.id);
    assert.equal(await getFeedback(workspaceA.id, feedbackB.id, db), null);
    assert.equal(await updateFeedback(workspaceA.id, feedbackB.id, { status: FeedbackStatus.REVIEWED }, db), null);
    assert.equal(await deleteFeedback(workspaceA.id, feedbackB.id, db), false);
    assert.equal(await db.theme.findFirst({ where: { id: themeB.id, workspaceId: workspaceA.id } }), null);
    assert.equal(await db.report.findFirst({ where: { id: reportA.id, workspaceId: workspaceB.id } }), null);
    assert.equal((await db.feedback.findUnique({ where: { id: feedbackB.id } }))?.status, FeedbackStatus.NEW);
  } finally {
    await db.feedbackTheme.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await db.report.deleteMany({ where: { id: reportA.id } });
    await db.feedback.deleteMany({ where: { id: { in: [feedbackA.id, feedbackB.id] } } });
    await db.theme.deleteMany({ where: { id: { in: [themeA.id, themeB.id] } } });
    await db.user.deleteMany({ where: { id: { in: [userA.id] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
    await db.$disconnect();
  }
});
