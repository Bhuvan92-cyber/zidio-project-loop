import assert from "node:assert/strict";
import test from "node:test";
import type { FeedbackStatus, Prisma } from "@prisma/client";
import { canWriteFeedback, createFeedback, deleteFeedback, getFeedback, listFeedback, updateFeedback, type Database } from "@/lib/feedback/service";

 type StoredFeedback = { id: string; workspaceId: string; content: string; status: FeedbackStatus };

function fakeDatabase(records: StoredFeedback[]): Database {
  const find = (where: { id?: string; workspaceId?: string }) => records.filter((record) => (!where.id || record.id === where.id) && (!where.workspaceId || record.workspaceId === where.workspaceId));
  const client = {
    feedback: {
      findMany: async ({ where }: { where: { id?: string; workspaceId?: string } }) => find(where),
      count: async ({ where }: { where: { id?: string; workspaceId?: string } }) => find(where).length,
      findFirst: async ({ where }: { where: { id?: string; workspaceId?: string } }) => find(where)[0] ?? null,
      updateMany: async ({ where, data }: { where: { id?: string; workspaceId?: string }; data: Prisma.FeedbackUpdateInput }) => {
        const matches = find(where);
        for (const record of matches) {
          if (typeof data.content === "string") record.content = data.content;
          if (typeof data.status === "string") record.status = data.status as FeedbackStatus;
        }
        return { count: matches.length };
      },
      deleteMany: async ({ where }: { where: { id?: string; workspaceId?: string } }) => {
        const matches = find(where);
        for (const record of matches) records.splice(records.indexOf(record), 1);
        return { count: matches.length };
      },
      create: async ({ data }: { data: StoredFeedback }) => { records.push(data); return data; },
    },
  } as unknown as Database;
  return client;
}

const query = { page: 1, pageSize: 20, sort: "createdAt" as const, direction: "desc" as const };

test("workspace A cannot read workspace B feedback by ID", async () => {
  const database = fakeDatabase([{ id: "feedback-b", workspaceId: "workspace-b", content: "private", status: "NEW" }]);
  assert.equal(await getFeedback("workspace-a", "feedback-b", database), null);
  assert.equal((await listFeedback("workspace-a", query, database)).pagination.total, 0);
});

test("workspace A cannot update workspace B feedback by ID", async () => {
  const records = [{ id: "feedback-b", workspaceId: "workspace-b", content: "private", status: "NEW" as FeedbackStatus }];
  const database = fakeDatabase(records);
  assert.equal(await updateFeedback("workspace-a", "feedback-b", { content: "tampered" }, database), null);
  assert.equal(records[0].content, "private");
});

test("workspace A cannot delete workspace B feedback by ID", async () => {
  const records = [{ id: "feedback-b", workspaceId: "workspace-b", content: "private", status: "NEW" as FeedbackStatus }];
  const database = fakeDatabase(records);
  assert.equal(await deleteFeedback("workspace-a", "feedback-b", database), false);
  assert.equal(records.length, 1);
});

test("feedback write permissions follow the three workspace roles", () => {
  assert.equal(canWriteFeedback("ADMIN"), true);
  assert.equal(canWriteFeedback("ANALYST"), true);
  assert.equal(canWriteFeedback("VIEWER"), false);
});

test("feedback creation cannot override the session workspace", async () => {
  const records: StoredFeedback[] = [];
  const database = fakeDatabase(records);
  await createFeedback("workspace-a", {
    content: "owned by workspace A",
    channel: "SUPPORT_TICKET",
    status: "NEW",
    workspaceId: "workspace-b",
  } as never, database);
  assert.equal(records[0].workspaceId, "workspace-a");
});
