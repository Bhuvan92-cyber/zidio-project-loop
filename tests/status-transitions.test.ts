import assert from "node:assert/strict";
import test from "node:test";
import type { FeedbackStatus, Prisma } from "@prisma/client";
import { statusAfterClassification } from "@/lib/ai/classifier";
import { canTransitionFeedbackStatus, InvalidFeedbackTransitionError, updateFeedback, type Database } from "@/lib/feedback/service";
import { feedbackUpdateSchema } from "@/lib/validation/feedback";

type RecordItem = { id: string; workspaceId: string; status: FeedbackStatus; content: string };

function database(records: RecordItem[]): Database {
  const find = (where: { id?: string; workspaceId?: string }) => records.filter((item) => (!where.id || item.id === where.id) && (!where.workspaceId || item.workspaceId === where.workspaceId));
  return { feedback: {
    findFirst: async ({ where }: { where: { id?: string; workspaceId?: string }; select?: unknown }) => find(where)[0] ?? null,
    updateMany: async ({ where, data }: { where: { id?: string; workspaceId?: string }; data: Prisma.FeedbackUpdateInput }) => {
      const matches = find(where);
      for (const item of matches) if (typeof data.status === "string") item.status = data.status as FeedbackStatus;
      return { count: matches.length };
    },
  } } as unknown as Database;
}

test("only the two forward status transitions are allowed", () => {
  assert.equal(canTransitionFeedbackStatus("NEW", "REVIEWED"), true);
  assert.equal(canTransitionFeedbackStatus("REVIEWED", "ACTIONED"), true);
  for (const [from, to] of [["NEW", "ACTIONED"], ["REVIEWED", "NEW"], ["ACTIONED", "REVIEWED"], ["ACTIONED", "NEW"], ["ACTIONED", "ACTIONED"], ["NEW", "NEW"], ["REVIEWED", "REVIEWED"]] as const) {
    assert.equal(canTransitionFeedbackStatus(from, to), false, `${from} -> ${to}`);
  }
});

test("service permits forward transitions and preserves records on rejected transitions", async () => {
  const records: RecordItem[] = [{ id: "feedback-a", workspaceId: "workspace-a", status: "NEW", content: "signal" }];
  const client = database(records);
  await updateFeedback("workspace-a", "feedback-a", { status: "REVIEWED" }, client);
  assert.equal(records[0].status, "REVIEWED");
  await assert.rejects(() => updateFeedback("workspace-a", "feedback-a", { status: "NEW" }, client), InvalidFeedbackTransitionError);
  assert.equal(records[0].status, "REVIEWED");
  await updateFeedback("workspace-a", "feedback-a", { status: "ACTIONED" }, client);
  assert.equal(records[0].status, "ACTIONED");
});

test("cross-workspace transitions are rejected and leave the record unchanged", async () => {
  const records: RecordItem[] = [{ id: "feedback-b", workspaceId: "workspace-b", status: "NEW", content: "private" }];
  assert.equal(await updateFeedback("workspace-a", "feedback-b", { status: "REVIEWED" }, database(records)), null);
  assert.deepEqual(records[0], { id: "feedback-b", workspaceId: "workspace-b", status: "NEW", content: "private" });
});

test("status validation rejects non-specification values", () => {
  for (const status of ["NEEDS_RETRY", "INVALID", "foo"]) assert.equal(feedbackUpdateSchema.safeParse({ status }).success, false, status);
});

test("classification never downgrades ACTIONED feedback", () => {
  assert.equal(statusAfterClassification("NEW"), "REVIEWED");
  assert.equal(statusAfterClassification("REVIEWED"), "REVIEWED");
  assert.equal(statusAfterClassification("ACTIONED"), "ACTIONED");
});
