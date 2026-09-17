import "dotenv/config";
import { PrismaClient, FeedbackChannel, FeedbackStatus, Role, Sentiment } from "@prisma/client";
import bcrypt from "bcryptjs";
import { processSeedFeedback } from "@/lib/feedback/seed-processing";

const db = new PrismaClient();

const themes = [
  ["Onboarding", "Activation and first-run experience", "#d9f36e"],
  ["Authentication", "Login, SSO, and account access", "#b6d8ff"],
  ["Mobile experience", "Mobile app usability and reliability", "#ffc98b"],
  ["Performance", "Speed, reliability, and responsiveness", "#c9b8ff"],
  ["Reporting", "Reports, exports, and data visibility", "#a7e4d0"],
  ["Billing", "Plans, invoices, and payment workflows", "#ffb6b0"],
  ["Integrations", "Connections to existing tools and workflows", "#c8d5b8"],
];

const feedbackSeeds: readonly [string, FeedbackChannel, Sentiment, string][] = [
  ["The first project setup was clear, but I needed more guidance on inviting teammates.", FeedbackChannel.SUPPORT_TICKET, Sentiment.POS, "Onboarding"],
  ["We keep getting bounced back to the login screen when SSO is enabled.", FeedbackChannel.SUPPORT_TICKET, Sentiment.NEG, "Authentication"],
  ["The mobile dashboard is useful, though charts take too long to load on cellular.", FeedbackChannel.APP_STORE, Sentiment.NEG, "Mobile experience"],
  ["Our weekly report is much easier to scan since the latest update.", FeedbackChannel.NPS_SURVEY, Sentiment.POS, "Reporting"],
  ["The export finished quickly, but the CSV columns were not in the order our team expects.", FeedbackChannel.SALES_CALL, Sentiment.NEU, "Reporting"],
  ["The app feels noticeably faster when switching between saved views.", FeedbackChannel.COMMUNITY, Sentiment.POS, "Performance"],
  ["I cannot tell which invoice is still open from the billing screen.", FeedbackChannel.SUPPORT_TICKET, Sentiment.NEG, "Billing"],
  ["Please add a native connection for our support queue; copying tickets is error-prone.", FeedbackChannel.SALES_CALL, Sentiment.NEU, "Integrations"],
  ["The checklist helped our team reach the first insight in one afternoon.", FeedbackChannel.NPS_SURVEY, Sentiment.POS, "Onboarding"],
  ["Password reset emails arrive several minutes late, which makes sign-in frustrating.", FeedbackChannel.APP_STORE, Sentiment.NEG, "Authentication"],
  ["Search finds exact phrases well but misses obvious related wording.", FeedbackChannel.COMMUNITY, Sentiment.NEU, "Performance"],
  ["The report summary gives leadership a much clearer view of customer risk.", FeedbackChannel.NPS_SURVEY, Sentiment.POS, "Reporting"],
];

function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seed is disabled in production. Set ALLOW_DEMO_SEED=true only for an intentional demo reset.");
  }

  const passwordHash = await bcrypt.hash("LoopDemo!2026", 12);
  const workspace = await db.workspace.upsert({ where: { id: "demo-workspace" }, update: { name: "Northstar Labs" }, create: { id: "demo-workspace", name: "Northstar Labs" } });
  const users = [
    ["Avery Morgan", "admin@loop-demo.test", Role.ADMIN],
    ["Sam Rivera", "analyst@loop-demo.test", Role.ANALYST],
    ["Jordan Lee", "viewer@loop-demo.test", Role.VIEWER],
  ] as const;
  for (const [name, email, role] of users) await db.user.upsert({ where: { email }, update: { name, role, workspaceId: workspace.id, passwordHash }, create: { name, email, role, passwordHash, workspaceId: workspace.id } });

  const themeRecords = new Map<string, string>();
  for (const [name, description, color] of themes) {
    const theme = await db.theme.upsert({ where: { workspaceId_normalized: { workspaceId: workspace.id, normalized: normalized(name) } }, update: { name, description, color }, create: { name, normalized: normalized(name), description, color, workspaceId: workspace.id } });
    themeRecords.set(name, theme.id);
  }

  await db.feedback.deleteMany({ where: { workspaceId: workspace.id } });
  const channels: FeedbackChannel[] = Object.values(FeedbackChannel);
  const feedbackIds: string[] = [];
  for (let index = 0; index < 120; index += 1) {
    const [template, templateChannel, sentiment, themeName] = feedbackSeeds[index % feedbackSeeds.length];
    const channel = index % 5 === 0 ? channels[index % channels.length] : templateChannel;
    const createdAt = new Date(Date.now() - (index * 19) * 60 * 60 * 1000);
    const feedback = await db.feedback.create({ data: { content: `${template} (sample ${index + 1})`, channel, sourceRef: `DEMO-${String(index + 1).padStart(4, "0")}`, customerLabel: ["Acme Co", "Brightline", "Cedar Health", "Orbit Works"][index % 4], sentiment, sentimentScore: sentiment === Sentiment.POS ? 0.72 : sentiment === Sentiment.NEG ? -0.68 : 0.04, status: index % 4 === 0 ? FeedbackStatus.ACTIONED : index % 3 === 0 ? FeedbackStatus.REVIEWED : FeedbackStatus.NEW, featureArea: themeName, rationale: "Seeded deterministic classification for demo analytics.", createdAt, workspaceId: workspace.id } });
    feedbackIds.push(feedback.id);
    await db.feedbackTheme.create({ data: { workspaceId: workspace.id, feedbackId: feedback.id, themeId: themeRecords.get(themeName)!, confidence: 0.86 } });
  }
  const processing = await processSeedFeedback(workspace.id, feedbackIds);
  console.log(`Seeded ${feedbackIds.length} feedback items; embedded ${processing.processedCount}; failed ${processing.failedCount}.`);
  if (processing.failedCount > 0) throw new Error(`Seed processing failed for ${processing.failedCount} feedback item(s).`);

  const seededWorkspace = await db.workspace.findUnique({ where: { id: workspace.id }, select: { id: true } });
  if (!seededWorkspace) throw new Error("Seed verification failed: demo workspace is missing.");
  const seededUsers = await db.user.findMany({ where: { workspaceId: workspace.id, email: { in: users.map(([, email]) => email) } }, select: { email: true, role: true, passwordHash: true } });
  if (seededUsers.length !== users.length || seededUsers.some((user) => !user.passwordHash.startsWith("$2") || user.passwordHash === "LoopDemo!2026" || users.some(([name, email, role]) => email === user.email && role !== user.role))) {
    throw new Error("Seed verification failed: demo users, roles, or password hashes are invalid.");
  }
  const seededFeedback = await db.feedback.findMany({ where: { workspaceId: workspace.id }, select: { id: true, workspaceId: true, sentiment: true, sentimentScore: true, featureArea: true, rationale: true } });
  if (seededFeedback.length !== feedbackIds.length || seededFeedback.some((feedback) => feedback.workspaceId !== workspace.id || !feedback.sentiment || feedback.sentimentScore === null || !feedback.featureArea || !feedback.rationale)) {
    throw new Error("Seed verification failed: Feedback count, ownership, or classification is incomplete.");
  }
  const [embeddingCount, inconsistentThemeCount] = await Promise.all([
    db.embedding.count({ where: { feedbackId: { in: feedbackIds } } }),
    db.feedbackTheme.count({ where: { feedbackId: { in: feedbackIds }, NOT: { workspaceId: workspace.id } } }),
  ]);
  if (embeddingCount !== feedbackIds.length || inconsistentThemeCount > 0) throw new Error("Seed verification failed: embedding or theme coverage is incomplete.");
  console.log(`Seed verification passed: workspace, users, ${seededFeedback.length} classified Feedback items, embeddings, and theme ownership verified.`);
}

main().finally(async () => { await db.$disconnect(); });
