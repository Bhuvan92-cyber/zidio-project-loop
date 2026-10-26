import assert from "node:assert/strict";
import test from "node:test";
import { generateInvitationToken, hashInvitationToken } from "@/lib/workspace/invitation-token";

test("invitation token generator creates secure random single-use tokens and distinct digests", () => {
  const { rawToken, tokenDigest } = generateInvitationToken();

  // Raw token is 32 bytes hex = 64 characters
  assert.equal(typeof rawToken, "string");
  assert.equal(rawToken.length, 64);
  assert.match(rawToken, /^[0-9a-f]{64}$/);

  // Token digest is SHA-256 hex = 64 characters
  assert.equal(typeof tokenDigest, "string");
  assert.equal(tokenDigest.length, 64);
  assert.match(tokenDigest, /^[0-9a-f]{64}$/);

  // Raw token must never equal its hash digest
  assert.notEqual(rawToken, tokenDigest);

  // Digest is deterministic for the same raw token
  const recomputedDigest = hashInvitationToken(rawToken);
  assert.equal(recomputedDigest, tokenDigest);

  // Consecutive tokens must be cryptographically random and unique
  const token2 = generateInvitationToken();
  assert.notEqual(token2.rawToken, rawToken);
  assert.notEqual(token2.tokenDigest, tokenDigest);
});
