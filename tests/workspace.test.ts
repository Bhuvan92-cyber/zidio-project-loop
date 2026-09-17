import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import test from "node:test";
import { createWorkspaceAdmin } from "@/lib/auth/signup";
import { signupSchema } from "@/lib/validation/auth";
import { canChangeMemberRole } from "@/lib/workspace/policy";

test("signup creates an ADMIN with a nested workspace association and hashed password", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const client = { user: { create: async (args: { data: unknown; select: unknown }) => { captured.push(args); return { id: "user-a", name: "Avery", email: "avery@example.test", role: "ADMIN" as const, workspaceId: "workspace-a", passwordHash: (args.data as { passwordHash: string }).passwordHash }; } } };
  const input = signupSchema.parse({ name: "Avery", email: "Avery@example.test", password: "secret-password", workspaceName: "Northstar" });
  const user = await createWorkspaceAdmin(input, client);
  const data = captured[0].data as { name: string; email: string; passwordHash: string; role: string; workspace: { create: { name: string } } };
  assert.equal(data.name, "Avery");
  assert.equal(data.email, "avery@example.test");
  assert.equal(data.role, "ADMIN");
  assert.deepEqual(data.workspace, { create: { name: "Northstar" } });
  assert.equal(await bcrypt.compare("secret-password", data.passwordHash), true);
  assert.notEqual(data.passwordHash, "secret-password");
  assert.equal(user.workspaceId, "workspace-a");
});

test("signup validation rejects invalid workspace input", () => {
  assert.equal(signupSchema.safeParse({ name: "A", email: "bad", password: "short", workspaceName: "" }).success, false);
});

test("member role policy preserves ADMIN safeguards and role boundaries", () => {
  assert.equal(canChangeMemberRole("ADMIN", "VIEWER", "ANALYST", "admin-a", "member-b", 1), true);
  assert.equal(canChangeMemberRole("ANALYST", "VIEWER", "ADMIN", "analyst-a", "member-b", 2), false);
  assert.equal(canChangeMemberRole("VIEWER", "VIEWER", "ADMIN", "viewer-a", "member-b", 2), false);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "VIEWER", "admin-a", "admin-a", 2), false);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "VIEWER", "admin-a", "admin-b", 1), false);
});
