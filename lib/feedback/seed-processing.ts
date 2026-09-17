import { db } from "@/lib/db";
import { processFeedback } from "@/lib/ai/classifier";

export type SeedProcessingDependencies = {
  process: (feedbackId: string, workspaceId: string) => Promise<unknown>;
  hasEmbedding: (feedbackId: string) => Promise<boolean>;
};

const defaultDependencies: SeedProcessingDependencies = {
  process: processFeedback,
  hasEmbedding: async (feedbackId) => Boolean(await db.embedding.findUnique({ where: { feedbackId }, select: { feedbackId: true } })),
};

export async function processSeedFeedback(workspaceId: string, feedbackIds: string[], dependencies: SeedProcessingDependencies = defaultDependencies) {
  const failures: string[] = [];
  for (const feedbackId of feedbackIds) {
    if (!(await dependencies.process(feedbackId, workspaceId)) || !(await dependencies.hasEmbedding(feedbackId))) failures.push(feedbackId);
  }
  return { processedCount: feedbackIds.length - failures.length, failedCount: failures.length, failedFeedbackIds: failures };
}
