import assert from "node:assert/strict";
import test from "node:test";
import { processSeedFeedback } from "@/lib/feedback/seed-processing";

test("seed processing routes every seeded Feedback through the canonical pipeline", async () => {
  const processed: string[] = [];
  const result = await processSeedFeedback("workspace-a", ["feedback-1", "feedback-2"], {
    process: async (feedbackId) => { processed.push(feedbackId); return { id: feedbackId }; },
    hasEmbedding: async () => true,
  });
  assert.deepEqual(processed, ["feedback-1", "feedback-2"]);
  assert.deepEqual(result, { processedCount: 2, failedCount: 0, failedFeedbackIds: [] });
});

test("seed processing reports classification or embedding failures instead of claiming completeness", async () => {
  const result = await processSeedFeedback("workspace-a", ["feedback-1", "feedback-2"], {
    process: async (feedbackId) => feedbackId === "feedback-1" ? { id: feedbackId } : null,
    hasEmbedding: async (feedbackId) => feedbackId === "feedback-1",
  });
  assert.deepEqual(result, { processedCount: 1, failedCount: 1, failedFeedbackIds: ["feedback-2"] });
});
