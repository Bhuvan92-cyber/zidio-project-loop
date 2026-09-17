import assert from "node:assert/strict";
import test from "node:test";
import { simulatedSupportTickets } from "@/lib/feedback/simulated";
import { feedbackCreateSchema } from "@/lib/validation/feedback";

test("simulated support fixtures use the supported channel and valid create payloads", () => {
  assert.equal(simulatedSupportTickets.length, 4);
  for (const fixture of simulatedSupportTickets) {
    assert.equal(fixture.channel, "SUPPORT_TICKET");
    assert.ok(fixture.content.trim().length > 0);
    assert.equal("workspaceId" in fixture, false);
    assert.equal(feedbackCreateSchema.safeParse(fixture).success, true);
  }
});
