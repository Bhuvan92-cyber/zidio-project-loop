import assert from "node:assert/strict";
import test from "node:test";
import { feedbackCreateSchema } from "@/lib/validation/feedback";

const channels = ["SUPPORT_TICKET", "APP_STORE", "NPS_SURVEY", "SALES_CALL", "COMMUNITY"] as const;

test("manual feedback payload accepts every supported channel without workspace fields", () => {
  for (const channel of channels) {
    const payload = { content: "Customer feedback", channel, customerLabel: "Acme Co" };
    const parsed = feedbackCreateSchema.safeParse(payload);
    assert.equal(parsed.success, true, channel);
    assert.equal("workspaceId" in payload, false);
  }
});

test("manual feedback validation requires trimmed content and a channel", () => {
  assert.equal(feedbackCreateSchema.safeParse({ content: "   ", channel: "COMMUNITY" }).success, false);
  assert.equal(feedbackCreateSchema.safeParse({ content: "Customer feedback" }).success, false);
});
