import { db } from "@/lib/db";
import { aiProvider } from "@/lib/ai/provider";
import { classificationSchema, type Classification } from "@/lib/ai/schemas";
import { classificationSystem } from "@/lib/ai/prompts";
import { createEmbedding } from "@/lib/ai/embeddings";
import type { FeedbackStatus } from "@prisma/client";

function normalizeTheme(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export function statusAfterClassification(status: FeedbackStatus): FeedbackStatus {
  return status === "ACTIONED" ? "ACTIONED" : "REVIEWED";
}

export async function classifyFeedback(content: string, workspaceId: string): Promise<Classification> {
  const themes = await db.theme.findMany({ where: { workspaceId }, select: { name: true } });
  return aiProvider.complete({ system: classificationSystem, user: JSON.stringify({ feedback: content, allowedThemes: themes.map((theme) => theme.name) }), schema: classificationSchema });
}

export async function persistClassification(feedbackId: string, workspaceId: string, classification: Classification) {
  return db.$transaction(async (tx) => {
    const existing = await tx.feedback.findFirst({ where: { id: feedbackId, workspaceId }, select: { status: true } });
    if (!existing) throw new Error("Feedback not found.");
    const feedback = await tx.feedback.updateMany({ where: { id: feedbackId, workspaceId }, data: { sentiment: classification.sentiment, sentimentScore: classification.sentimentScore, featureArea: classification.featureArea, rationale: classification.rationale, status: statusAfterClassification(existing.status) } });
    if (feedback.count === 0) throw new Error("Feedback not found.");
    await tx.feedbackTheme.deleteMany({ where: { feedbackId, workspaceId } });
    for (const themeName of classification.themes) {
      const normalized = normalizeTheme(themeName);
      if (!normalized) continue;
      const theme = await tx.theme.upsert({ where: { workspaceId_normalized: { workspaceId, normalized } }, update: {}, create: { workspaceId, name: themeName, normalized, color: "#c8d5b8" } });
      await tx.feedbackTheme.create({ data: { workspaceId, feedbackId, themeId: theme.id, confidence: 0.8 } });
    }
    return tx.feedback.findFirst({ where: { id: feedbackId, workspaceId }, include: { themes: { include: { theme: true } } } });
  });
}

export async function processFeedback(feedbackId: string, workspaceId: string) {
  try {
    const feedback = await db.feedback.findFirst({ where: { id: feedbackId, workspaceId }, select: { content: true } });
    if (!feedback) return null;
    const classification = await classifyFeedback(feedback.content, workspaceId);
    const updated = await persistClassification(feedbackId, workspaceId, classification);
    try {
      const vector = await createEmbedding(feedback.content);
      await db.embedding.upsert({ where: { feedbackId }, update: { vector }, create: { feedbackId, vector } });
    } catch (error) {
      console.error("Embedding failed", error instanceof Error ? error.message : "unknown error");
    }
    return updated;
  } catch (error) {
    console.error("Classification failed", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
