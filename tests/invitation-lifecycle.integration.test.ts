import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { PrismaClient, Role, InvitationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getSentEmails, clearSentEmails } from "@/lib/email/service";
import { hashInvitationToken } from "@/lib/workspace/invitation-token";

const testDbUrl = process.env.TEST_DATABASE_URL;
const integration = testDbUrl ? test : test.skip;

class MockAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let activeSession = {
  user: {
    id: "",
    role: "ADMIN" as Role,
    workspaceId: "",
    name: "Admin Tester",
    email: "",
  },
};

mock.module("@/lib/auth/guards", {
  namedExports: {
    AuthError: MockAuthError,
    requireSession: async () => {
      const db = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
      try {
        const user = await db.user.findUnique({
          where: { id: activeSession.user.id },
          select: { id: true, role: true, workspaceId: true, membershipStatus: true },
        });
        if (!user || user.membershipStatus !== "ACTIVE") {
          throw new MockAuthError("Authentication required.", 401);
        }
        return {
          user: {
            id: user.id,
            role: user.role,
            workspaceId: user.workspaceId,
            name: activeSession.user.name,
            email: activeSession.user.email,
          },
        };
      } finally {
        await db.$disconnect();
      }
    },
    requireRole: async (roles: Role[]) => {
      const db = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
      try {
        const user = await db.user.findUnique({
          where: { id: activeSession.user.id },
          select: { id: true, role: true, workspaceId: true, membershipStatus: true },
        });
        if (!user || user.membershipStatus !== "ACTIVE") {
          throw new MockAuthError("Authentication required.", 401);
        }
        if (!roles.includes(user.role)) {
          throw new MockAuthError("You do not have permission for this action.", 403);
        }
        return {
          user: {
            id: user.id,
            role: user.role,
            workspaceId: user.workspaceId,
            name: activeSession.user.name,
            email: activeSession.user.email,
          },
        };
      } finally {
        await db.$disconnect();
      }
    },
  },
});

mock.module("next-auth", {
  namedExports: {
    getServerSession: async () => {
      if (!activeSession.user.id) return null;
      return { user: { ...activeSession.user } };
    },
  },
});

integration("Workspace Invitations & Member Removal Full Lifecycle", async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
  const suffix = `inv-${Date.now()}`;
  clearSentEmails();

  // 1. Create Workspace A and Admin A
  const wsA = await db.workspace.create({ data: { name: `Workspace A ${suffix}` } });
  const adminA = await db.user.create({
    data: {
      name: "Admin A",
      email: `admin-a-${suffix}@example.test`,
      passwordHash: await bcrypt.hash("password", 10),
      role: Role.ADMIN,
      workspaceId: wsA.id,
    },
  });

  // Create Workspace B and Admin B (for cross-workspace isolation tests)
  const wsB = await db.workspace.create({ data: { name: `Workspace B ${suffix}` } });
  const adminB = await db.user.create({
    data: {
      name: "Admin B",
      email: `admin-b-${suffix}@example.test`,
      passwordHash: await bcrypt.hash("password", 10),
      role: Role.ADMIN,
      workspaceId: wsB.id,
    },
  });

  // Create an Analyst in Workspace A
  const analystA = await db.user.create({
    data: {
      name: "Analyst A",
      email: `analyst-a-${suffix}@example.test`,
      passwordHash: await bcrypt.hash("password", 10),
      role: Role.ANALYST,
      workspaceId: wsA.id,
    },
  });

  // Import route handlers
  const { POST: createInvitation, GET: listInvitations } = await import("@/app/api/workspace/invitations/route");
  const { POST: resendInvitation } = await import("@/app/api/workspace/invitations/[id]/resend/route");
  const { POST: revokeInvitation } = await import("@/app/api/workspace/invitations/[id]/revoke/route");
  const { GET: verifyInvitation } = await import("@/app/api/workspace/invitations/verify/route");
  const { POST: acceptInvitation } = await import("@/app/api/workspace/invitations/accept/route");
  const { DELETE: deleteMember } = await import("@/app/api/workspace/members/[id]/route");

  // Act as Admin A
  activeSession.user = {
    id: adminA.id,
    role: Role.ADMIN,
    workspaceId: wsA.id,
    name: adminA.name,
    email: adminA.email,
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Admin invites an ANALYST
    // -------------------------------------------------------------------------
    const inviteEmail1 = `invitee-analyst-${suffix}@example.test`;
    const inviteResp1 = await createInvitation(
      new Request("http://localhost/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail1, role: "ANALYST" }),
      }),
    );
    assert.equal(inviteResp1.status, 201, "Admin should successfully invite an ANALYST");
    const inviteData1 = await inviteResp1.json();
    assert.equal(inviteData1.data.email, inviteEmail1);
    assert.equal(inviteData1.data.role, "ANALYST");
    assert.equal(inviteData1.data.status, "PENDING");
    assert.equal(inviteData1.data.emailSent, true);

    // Verify database record
    const dbInv1 = await db.workspaceInvitation.findUnique({ where: { id: inviteData1.data.id } });
    assert.ok(dbInv1, "Invitation must exist in DB");
    assert.equal(dbInv1.status, InvitationStatus.PENDING);
    assert.equal(dbInv1.workspaceId, wsA.id);

    // Verify outbox email was sent
    const sentEmails = getSentEmails();
    assert.ok(sentEmails.length >= 1, "An email must have been sent");
    const lastEmail = sentEmails[sentEmails.length - 1];
    assert.equal(lastEmail.to, inviteEmail1);
    const tokenMatch = lastEmail.inviteLink.match(/token=([a-f0-9]+)/);
    assert.ok(tokenMatch, "Email link must contain a token parameter");
    const rawToken1 = tokenMatch[1];

    // Verify token digest was stored, NOT the raw token
    assert.notEqual(dbInv1.tokenDigest, rawToken1, "Raw token must never be stored directly in DB");
    assert.equal(dbInv1.tokenDigest, hashInvitationToken(rawToken1), "DB digest must match SHA-256 of raw token");

    // -------------------------------------------------------------------------
    // TEST 2: Admin cannot invite ADMIN role through invitation flow
    // -------------------------------------------------------------------------
    const adminInviteResp = await createInvitation(
      new Request("http://localhost/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `hack-admin-${suffix}@example.test`, role: "ADMIN" }),
      }),
    );
    assert.equal(adminInviteResp.status, 400, "Invitation for ADMIN role must be rejected");

    // -------------------------------------------------------------------------
    // TEST 3: Invalid email formats are rejected
    // -------------------------------------------------------------------------
    const invalidEmailResp = await createInvitation(
      new Request("http://localhost/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", role: "VIEWER" }),
      }),
    );
    assert.equal(invalidEmailResp.status, 400, "Invalid email format must be rejected");

    // -------------------------------------------------------------------------
    // TEST 4: Existing active member cannot be invited
    // -------------------------------------------------------------------------
    const existingMemberInviteResp = await createInvitation(
      new Request("http://localhost/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: analystA.email, role: "VIEWER" }),
      }),
    );
    assert.equal(existingMemberInviteResp.status, 409, "Inviting existing active member must return 409");

    // -------------------------------------------------------------------------
    // TEST 5: Duplicate pending invitation is rejected with 409
    // -------------------------------------------------------------------------
    const duplicateInviteResp = await createInvitation(
      new Request("http://localhost/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail1, role: "ANALYST" }),
      }),
    );
    assert.equal(duplicateInviteResp.status, 409, "Duplicate pending invitation must return 409");

    // -------------------------------------------------------------------------
    // TEST 6: Resend rotates the token and extends expiration
    // -------------------------------------------------------------------------
    const resendResp = await resendInvitation(new Request("http://localhost/api/workspace/invitations/id/resend", { method: "POST" }), {
      params: { id: inviteData1.data.id },
    });
    assert.equal(resendResp.status, 200, "Resend must succeed with 200");
    const resendData = await resendResp.json();
    assert.ok(resendData.data.resentAt);

    // Old raw token should now fail verification
    const oldTokenVerify = await verifyInvitation(
      new Request(`http://localhost/api/workspace/invitations/verify?token=${rawToken1}`),
    );
    assert.equal(oldTokenVerify.status, 400, "Old token must be invalidated after resend");

    // Get the new token from the latest email
    const emailsAfterResend = getSentEmails();
    const newEmail = emailsAfterResend[emailsAfterResend.length - 1];
    const newTokenMatch = newEmail.inviteLink.match(/token=([a-f0-9]+)/);
    assert.ok(newTokenMatch);
    const rawTokenResent = newTokenMatch[1];
    assert.notEqual(rawTokenResent, rawToken1, "Resent token must be rotated to a new random value");

    // New token verifies successfully
    const newTokenVerify = await verifyInvitation(
      new Request(`http://localhost/api/workspace/invitations/verify?token=${rawTokenResent}`),
    );
    assert.equal(newTokenVerify.status, 200, "Rotated token must verify successfully");

    // -------------------------------------------------------------------------
    // TEST 7: Revoke invitation marks status REVOKED and blocks acceptance
    // -------------------------------------------------------------------------
    const revokeResp = await revokeInvitation(new Request("http://localhost/api/workspace/invitations/id/revoke", { method: "POST" }), {
      params: { id: inviteData1.data.id },
    });
    assert.equal(revokeResp.status, 200, "Revoke should return 200");
    const revokeData = await revokeResp.json();
    assert.equal(revokeData.data.status, "REVOKED");

    // Verifying revoked invitation returns 400
    const verifyRevoked = await verifyInvitation(
      new Request(`http://localhost/api/workspace/invitations/verify?token=${rawTokenResent}`),
    );
    assert.equal(verifyRevoked.status, 400, "Revoked invitation must not verify");

    // Attempting to accept revoked invitation returns 400
    const acceptRevoked = await acceptInvitation(
      new Request("http://localhost/api/workspace/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawTokenResent }),
      }),
    );
    assert.equal(acceptRevoked.status, 400, "Revoked invitation cannot be accepted");

    // -------------------------------------------------------------------------
    // TEST 8: Create a fresh invitation for VIEWER and test authenticated acceptance
    // -------------------------------------------------------------------------
    const viewerEmail = `viewer-target-${suffix}@example.test`;
    const createViewerResp = await createInvitation(
      new Request("http://localhost/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: viewerEmail, role: "VIEWER" }),
      }),
    );
    assert.equal(createViewerResp.status, 201);
    const viewerInvData = await createViewerResp.json();
    const emailsForViewer = getSentEmails();
    const viewerEmailRecord = emailsForViewer[emailsForViewer.length - 1];
    const viewerToken = viewerEmailRecord.inviteLink.match(/token=([a-f0-9]+)/)![1];

    // Create an authenticated user with matching email
    const invitedUser = await db.user.create({
      data: {
        name: "Invited User",
        email: viewerEmail,
        passwordHash: await bcrypt.hash("password", 10),
        role: Role.ANALYST,
        workspaceId: wsB.id, // currently in Workspace B
      },
    });

    // Subtest: Authenticated email mismatch
    activeSession.user = {
      id: adminA.id,
      role: Role.ADMIN,
      workspaceId: wsA.id,
      name: adminA.name,
      email: adminA.email, // does not match viewerEmail!
    };
    const mismatchAccept = await acceptInvitation(
      new Request("http://localhost/api/workspace/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: viewerToken }),
      }),
    );
    assert.equal(mismatchAccept.status, 403, "Mismatched email must receive 403 Forbidden");

    // Subtest: Matching email acceptance
    activeSession.user = {
      id: invitedUser.id,
      role: Role.ANALYST,
      workspaceId: wsB.id,
      name: invitedUser.name,
      email: invitedUser.email, // matches viewerEmail!
    };
    const validAccept = await acceptInvitation(
      new Request("http://localhost/api/workspace/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: viewerToken }),
      }),
    );
    assert.equal(validAccept.status, 200, "Matching user must successfully accept invitation");
    const acceptBody = await validAccept.json();
    assert.equal(acceptBody.data.workspaceId, wsA.id);
    assert.equal(acceptBody.data.role, "VIEWER");

    // Verify user in database: associated with wsA, role VIEWER, membershipStatus ACTIVE
    const dbUpdatedUser = await db.user.findUnique({ where: { id: invitedUser.id } });
    assert.equal(dbUpdatedUser?.workspaceId, wsA.id, "User must now be in Workspace A");
    assert.equal(dbUpdatedUser?.role, Role.VIEWER, "User role must match invitation role");

    // Verify invitation in DB: marked ACCEPTED
    const dbAcceptedInv = await db.workspaceInvitation.findUnique({ where: { id: viewerInvData.data.id } });
    assert.equal(dbAcceptedInv?.status, InvitationStatus.ACCEPTED);
    assert.ok(dbAcceptedInv?.acceptedAt);
    assert.equal(dbAcceptedInv?.acceptedById, invitedUser.id);

    // Subtest: Consumed invitation cannot be reused
    const reuseAccept = await acceptInvitation(
      new Request("http://localhost/api/workspace/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: viewerToken }),
      }),
    );
    assert.equal(reuseAccept.status, 400, "Consumed invitation must not be reusable");

    // -------------------------------------------------------------------------
    // TEST 9: Member Removal
    // -------------------------------------------------------------------------
    // Switch session back to Admin A
    activeSession.user = {
      id: adminA.id,
      role: Role.ADMIN,
      workspaceId: wsA.id,
      name: adminA.name,
      email: adminA.email,
    };

    // Subtest: Admin cannot remove themselves
    const selfRemove = await deleteMember(new Request("http://localhost/api/workspace/members/id", { method: "DELETE" }), {
      params: { id: adminA.id },
    });
    assert.equal(selfRemove.status, 400, "Self removal must be rejected");

    // Subtest: Admin cannot remove member from another workspace (wsB)
    const crossRemove = await deleteMember(new Request("http://localhost/api/workspace/members/id", { method: "DELETE" }), {
      params: { id: adminB.id },
    });
    assert.equal(crossRemove.status, 404, "Cross-workspace removal must return 404");

    // Subtest: Admin removes Analyst A
    const removeAnalyst = await deleteMember(new Request("http://localhost/api/workspace/members/id", { method: "DELETE" }), {
      params: { id: analystA.id },
    });
    assert.equal(removeAnalyst.status, 200, "Removal of analyst must succeed with 200");

    // Verify Analyst A status is REVOKED in DB
    const dbRevokedUser = await db.user.findUnique({ where: { id: analystA.id } });
    assert.equal(dbRevokedUser?.membershipStatus, "REVOKED", "Membership status must be REVOKED");

    // Verify Analyst A's session is now denied on the server
    activeSession.user = {
      id: analystA.id,
      role: Role.ANALYST,
      workspaceId: wsA.id,
      name: analystA.name,
      email: analystA.email,
    };
    const { requireSession } = await import("@/lib/auth/guards");
    await assert.rejects(
      async () => {
        await requireSession();
      },
      (err: any) => err.status === 401,
      "Revoked member must immediately fail requireSession with 401",
    );
  } finally {
    // Cleanup test data
    await db.workspaceInvitation.deleteMany({ where: { workspaceId: { in: [wsA.id, wsB.id] } } });
    await db.user.deleteMany({ where: { workspaceId: { in: [wsA.id, wsB.id] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA.id, wsB.id] } } });
    await db.$disconnect();
  }
});
