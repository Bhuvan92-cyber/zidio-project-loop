import assert from "node:assert/strict";
import test from "node:test";
import { authErrorResponse } from "@/lib/auth/guards";
import { AIProviderError } from "@/lib/ai/errors";

test("provider failures are not mapped as authorization errors", async () => {
  const response = authErrorResponse(new AIProviderError("The AI provider is temporarily unavailable.", 503, "unavailable"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "The AI provider is temporarily unavailable." });
});

test("database connection failures are mapped as service-unavailable errors", async () => {
  const error = new Error("P1001: Can't reach database server");
  error.name = "PrismaClientKnownRequestError";
  const response = authErrorResponse(error);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "The database is temporarily unavailable." });
});
