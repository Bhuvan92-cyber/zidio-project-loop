import assert from "node:assert/strict";
import test from "node:test";
import { config } from "@/middleware";
import { clearLoginFailures, isLoginRateLimited, recordFailedLogin } from "@/lib/auth/login-policy";
import { loginSchema } from "@/lib/validation/auth";

test("login validation rejects missing or malformed credentials", () => {
  assert.equal(loginSchema.safeParse({}).success, false);
  assert.equal(loginSchema.safeParse({ email: "not-an-email", password: "secret" }).success, false);
});

test("failed login policy limits repeated attempts and resets after success", () => {
  const email = `auth-test-${Date.now()}@example.test`;
  clearLoginFailures(email);
  assert.equal(isLoginRateLimited(email), false);
  for (let attempt = 0; attempt < 5; attempt += 1) recordFailedLogin(email);
  assert.equal(isLoginRateLimited(email), true);
  clearLoginFailures(email);
  assert.equal(isLoginRateLimited(email), false);
});

test("root application route is included in protected middleware paths", () => {
  assert.ok(config.matcher?.includes("/"));
});
