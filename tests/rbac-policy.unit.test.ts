import assert from "node:assert/strict";
import test from "node:test";
import { Role } from "@prisma/client";
import { canChangeMemberRole } from "@/lib/workspace/policy";
import { canWriteFeedback } from "@/lib/feedback/service";
import { memberRoleSchema } from "@/lib/validation/feedback";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth/guards";

test("canChangeMemberRole enforces administrator privileges and safeguards", () => {
  const adminId = "admin-1";
  const otherAdminId = "admin-2";
  const memberId = "member-1";

  // 1. Admin assigns allowed roles in workspace
  assert.equal(canChangeMemberRole("ADMIN", "VIEWER", "ANALYST", adminId, memberId, 1), true);
  assert.equal(canChangeMemberRole("ADMIN", "ANALYST", "VIEWER", adminId, memberId, 1), true);
  assert.equal(canChangeMemberRole("ADMIN", "VIEWER", "ADMIN", adminId, memberId, 1), true);
  assert.equal(canChangeMemberRole("ADMIN", "ANALYST", "ADMIN", adminId, memberId, 1), true);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "ADMIN", adminId, memberId, 1), true);

  // 2. Admin demotes another admin when multiple admins exist
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "ANALYST", adminId, otherAdminId, 2), true);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "VIEWER", adminId, otherAdminId, 2), true);

  // 3. Admin cannot demote another admin when they are the only admin left
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "ANALYST", adminId, otherAdminId, 1), false);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "VIEWER", adminId, otherAdminId, 1), false);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "VIEWER", adminId, otherAdminId, 0), false);

  // 4. Admin cannot demote themselves even if multiple admins exist
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "ANALYST", adminId, adminId, 2), false);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "VIEWER", adminId, adminId, 2), false);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "ANALYST", adminId, adminId, 1), false);
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "VIEWER", adminId, adminId, 1), false);

  // 5. Admin can confirm their own admin role
  assert.equal(canChangeMemberRole("ADMIN", "ADMIN", "ADMIN", adminId, adminId, 1), true);

  // 6. ANALYST cannot change any role or promote themselves
  assert.equal(canChangeMemberRole("ANALYST", "VIEWER", "ANALYST", memberId, "other-1", 2), false);
  assert.equal(canChangeMemberRole("ANALYST", "VIEWER", "ADMIN", memberId, "other-1", 2), false);
  assert.equal(canChangeMemberRole("ANALYST", "ADMIN", "VIEWER", memberId, otherAdminId, 2), false);
  assert.equal(canChangeMemberRole("ANALYST", "ANALYST", "ADMIN", memberId, memberId, 2), false);

  // 7. VIEWER cannot change any role or promote themselves
  assert.equal(canChangeMemberRole("VIEWER", "VIEWER", "ANALYST", memberId, "other-1", 2), false);
  assert.equal(canChangeMemberRole("VIEWER", "ANALYST", "VIEWER", memberId, "other-1", 2), false);
  assert.equal(canChangeMemberRole("VIEWER", "VIEWER", "ADMIN", memberId, memberId, 2), false);
  assert.equal(canChangeMemberRole("VIEWER", "ADMIN", "VIEWER", memberId, otherAdminId, 2), false);
});

test("memberRoleSchema accepts only canonical roles and rejects invalid values", () => {
  // Allowed canonical roles
  assert.equal(memberRoleSchema.safeParse({ role: "ADMIN" }).success, true);
  assert.equal(memberRoleSchema.safeParse({ role: "ANALYST" }).success, true);
  assert.equal(memberRoleSchema.safeParse({ role: "VIEWER" }).success, true);

  // Rejects unofficial or unsupported roles
  assert.equal(memberRoleSchema.safeParse({ role: "USER" }).success, false);
  assert.equal(memberRoleSchema.safeParse({ role: "EDITOR" }).success, false);
  assert.equal(memberRoleSchema.safeParse({ role: "SUPERADMIN" }).success, false);
  assert.equal(memberRoleSchema.safeParse({ role: "OWNER" }).success, false);
  assert.equal(memberRoleSchema.safeParse({ role: "admin" }).success, false);
  assert.equal(memberRoleSchema.safeParse({ role: "analyst" }).success, false);
  assert.equal(memberRoleSchema.safeParse({ role: "viewer" }).success, false);

  // Rejects missing, malformed, or empty values
  assert.equal(memberRoleSchema.safeParse({ role: "" }).success, false);
  assert.equal(memberRoleSchema.safeParse({ role: null }).success, false);
  assert.equal(memberRoleSchema.safeParse({ role: 123 }).success, false);
  assert.equal(memberRoleSchema.safeParse({}).success, false);
  assert.equal(memberRoleSchema.safeParse(null).success, false);
  assert.equal(memberRoleSchema.safeParse(undefined).success, false);
});

test("canWriteFeedback allows ADMIN and ANALYST, and denies VIEWER", () => {
  assert.equal(canWriteFeedback("ADMIN"), true);
  assert.equal(canWriteFeedback("ANALYST"), true);
  assert.equal(canWriteFeedback("VIEWER"), false);
});

test("authErrorResponse maps auth errors, DB unavailabilities, and concurrency conflicts to correct status codes", async () => {
  const err401 = new AuthError("Authentication required.", 401);
  const resp401 = authErrorResponse(err401);
  assert.equal(resp401.status, 401);
  assert.deepEqual(await resp401.json(), { error: "Authentication required." });

  const err403 = new AuthError("You do not have permission for this action.", 403);
  const resp403 = authErrorResponse(err403);
  assert.equal(resp403.status, 403);
  assert.deepEqual(await resp403.json(), { error: "You do not have permission for this action." });

  const errDb = new Error("P1001: Can't reach database server at localhost:5432");
  const resp503 = authErrorResponse(errDb);
  assert.equal(resp503.status, 503);
  assert.deepEqual(await resp503.json(), { error: "The database is temporarily unavailable." });

  const errConflict = Object.assign(new Error("P2034: Transaction failed due to a write conflict or a deadlock."), { code: "P2034" });
  const resp409 = authErrorResponse(errConflict);
  assert.equal(resp409.status, 409);
  assert.deepEqual(await resp409.json(), { error: "Concurrent modification conflict. Please retry." });

  const errUnknown = new Error("Unexpected crash");
  const resp500 = authErrorResponse(errUnknown);
  assert.equal(resp500.status, 500);
  assert.deepEqual(await resp500.json(), { error: "Unable to complete request." });
});
