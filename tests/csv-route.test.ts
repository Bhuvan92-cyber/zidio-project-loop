import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/feedback/import/route";
import { canWriteFeedback } from "@/lib/feedback/service";
import { importCsvContent } from "@/lib/feedback/import";

test("CSV import rejects unauthenticated requests before reading the upload", async () => {
  const response = await POST(new Request("http://localhost/api/feedback/import", { method: "POST" }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
});

test("CSV import follows existing feedback write roles", () => {
  assert.equal(canWriteFeedback("ADMIN"), true);
  assert.equal(canWriteFeedback("ANALYST"), true);
  assert.equal(canWriteFeedback("VIEWER"), false);
});

test("CSV rows use the canonical persistence and processing pipeline with the session workspace", async () => {
  const persisted: Array<{ workspaceId: string; count: number }> = [];
  const processed: Array<{ id: string; workspaceId: string }> = [];
  const result = await importCsvContent("workspace-a", "content,channel,created_at\nfirst,community,2026-09-17\nsecond,sales_call,2026-09-18", {
    persist: async (workspaceId, rows) => { persisted.push({ workspaceId, count: rows.length }); return rows.map((_, index) => ({ id: `feedback-${index}` })); },
    process: async (id, workspaceId) => { processed.push({ id, workspaceId }); return { id }; },
  });
  assert.equal(result.importedCount, 2);
  assert.deepEqual(persisted, [{ workspaceId: "workspace-a", count: 2 }]);
  assert.deepEqual(processed, [{ id: "feedback-0", workspaceId: "workspace-a" }, { id: "feedback-1", workspaceId: "workspace-a" }]);
});
