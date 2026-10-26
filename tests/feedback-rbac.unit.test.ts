import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { FeedbackStatus, Prisma, Role } from "@prisma/client";
import {
  canTransitionFeedbackStatus,
  canWriteFeedback,
  InvalidFeedbackTransitionError,
  updateFeedback,
  type Database,
} from "@/lib/feedback/service";
import { feedbackCreateSchema, feedbackUpdateSchema } from "@/lib/validation/feedback";

// ---------------------------------------------------------------------------
// 1. Policy & Status Transition Rules
// ---------------------------------------------------------------------------

test("canWriteFeedback permits ADMIN and ANALYST, and forbids VIEWER", () => {
  assert.equal(canWriteFeedback("ADMIN"), true);
  assert.equal(canWriteFeedback("ANALYST"), true);
  assert.equal(canWriteFeedback("VIEWER"), false);
});

test("canTransitionFeedbackStatus allows strict forward progression only", () => {
  // Valid forward transitions
  assert.equal(canTransitionFeedbackStatus("NEW", "REVIEWED"), true);
  assert.equal(canTransitionFeedbackStatus("REVIEWED", "ACTIONED"), true);

  // Disallowed transitions
  assert.equal(canTransitionFeedbackStatus("NEW", "ACTIONED"), false);
  assert.equal(canTransitionFeedbackStatus("REVIEWED", "NEW"), false);
  assert.equal(canTransitionFeedbackStatus("ACTIONED", "REVIEWED"), false);
  assert.equal(canTransitionFeedbackStatus("ACTIONED", "NEW"), false);
  assert.equal(canTransitionFeedbackStatus("ACTIONED", "ACTIONED"), false);
  assert.equal(canTransitionFeedbackStatus("NEW", "NEW"), false);
  assert.equal(canTransitionFeedbackStatus("REVIEWED", "REVIEWED"), false);
});

// ---------------------------------------------------------------------------
// 2. Service-layer status transition and workspace isolation
// ---------------------------------------------------------------------------

type RecordItem = { id: string; workspaceId: string; status: FeedbackStatus; content: string };

function mockDb(records: RecordItem[]): Database {
  const find = (where: { id?: string; workspaceId?: string }) =>
    records.filter(
      (item) =>
        (!where.id || item.id === where.id) &&
        (!where.workspaceId || item.workspaceId === where.workspaceId)
    );

  return {
    feedback: {
      findFirst: async ({ where }: { where: { id?: string; workspaceId?: string }; select?: unknown }) =>
        find(where)[0] ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; workspaceId?: string; status?: FeedbackStatus };
        data: Prisma.FeedbackUpdateInput;
      }) => {
        const matches = find(where).filter((item) => !where.status || item.status === where.status);
        for (const item of matches) {
          if (typeof data.status === "string") item.status = data.status as FeedbackStatus;
        }
        return { count: matches.length };
      },
    },
  } as unknown as Database;
}

test("updateFeedback enforces valid forward transitions", async () => {
  const records: RecordItem[] = [{ id: "fb-1", workspaceId: "ws-1", status: "NEW", content: "Great app!" }];
  const client = mockDb(records);

  // NEW -> REVIEWED succeeds
  await updateFeedback("ws-1", "fb-1", { status: "REVIEWED" }, client);
  assert.equal(records[0].status, "REVIEWED");

  // REVIEWED -> ACTIONED succeeds
  await updateFeedback("ws-1", "fb-1", { status: "ACTIONED" }, client);
  assert.equal(records[0].status, "ACTIONED");

  // ACTIONED -> REVIEWED fails
  await assert.rejects(
    () => updateFeedback("ws-1", "fb-1", { status: "REVIEWED" }, client),
    InvalidFeedbackTransitionError
  );
  assert.equal(records[0].status, "ACTIONED");
});

test("updateFeedback rejects skipped forward transition (NEW -> ACTIONED)", async () => {
  const records: RecordItem[] = [{ id: "fb-2", workspaceId: "ws-1", status: "NEW", content: "Needs fix" }];
  const client = mockDb(records);

  await assert.rejects(
    () => updateFeedback("ws-1", "fb-2", { status: "ACTIONED" }, client),
    InvalidFeedbackTransitionError
  );
  assert.equal(records[0].status, "NEW");
});

test("updateFeedback rejects cross-workspace updates without leaking or mutating", async () => {
  const records: RecordItem[] = [{ id: "fb-tenant-b", workspaceId: "ws-b", status: "NEW", content: "Secret" }];
  const client = mockDb(records);

  // ws-a attempts to update feedback in ws-b
  const result = await updateFeedback("ws-a", "fb-tenant-b", { status: "REVIEWED" }, client);
  assert.equal(result, null);
  assert.equal(records[0].status, "NEW");
});

// ---------------------------------------------------------------------------
// 3. Schema validation & mass-assignment prevention
// ---------------------------------------------------------------------------

test("feedbackCreateSchema accepts valid feedback and rejects invalid channels or long content", () => {
  const valid = {
    content: "Customer wants dark mode support.",
    channel: "SUPPORT_TICKET",
    customerLabel: "Enterprise User",
  };
  assert.equal(feedbackCreateSchema.safeParse(valid).success, true);

  // Rejects empty content
  assert.equal(feedbackCreateSchema.safeParse({ ...valid, content: "   " }).success, false);

  // Rejects content over 10,000 characters
  assert.equal(feedbackCreateSchema.safeParse({ ...valid, content: "a".repeat(10_001) }).success, false);

  // Rejects invalid channel enum
  assert.equal(feedbackCreateSchema.safeParse({ ...valid, channel: "UNKNOWN_CHANNEL" }).success, false);

  // Strips or ignores unexpected fields
  const parsed = feedbackCreateSchema.parse({ ...valid, workspaceId: "malicious-ws", id: "malicious-id" });
  assert.equal("workspaceId" in parsed, false);
  assert.equal("id" in parsed, false);
});

test("feedbackUpdateSchema restricts mutations to permitted fields and valid status values", () => {
  assert.equal(feedbackUpdateSchema.safeParse({ status: "REVIEWED" }).success, true);
  assert.equal(feedbackUpdateSchema.safeParse({ status: "ACTIONED" }).success, true);
  assert.equal(feedbackUpdateSchema.safeParse({ status: "INVALID_STATUS" }).success, false);

  // Disallows updating workspaceId or id
  const parsed = feedbackUpdateSchema.parse({
    status: "REVIEWED",
    workspaceId: "injected-ws",
    id: "injected-id",
  } as any);
  assert.equal("workspaceId" in parsed, false);
  assert.equal("id" in parsed, false);
});

