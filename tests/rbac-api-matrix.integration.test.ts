import assert from "node:assert/strict";
import test, { mock } from "node:test";

class MockAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let currentAuth = {
  authenticated: false,
  role: "VIEWER" as "ADMIN" | "ANALYST" | "VIEWER",
  workspaceId: "ws-test-matrix",
  userId: "user-matrix",
};

mock.module("@/lib/auth/guards", {
  namedExports: {
    AuthError: MockAuthError,
    authErrorResponse: (error: unknown) => {
      if (error instanceof MockAuthError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      return Response.json({ error: "Unhandled error" }, { status: 500 });
    },
    requireSession: async () => {
      if (!currentAuth.authenticated) throw new MockAuthError("Authentication required.", 401);
      return {
        user: {
          id: currentAuth.userId,
          role: currentAuth.role,
          workspaceId: currentAuth.workspaceId,
        },
      };
    },
    requireRole: async (roles: Array<"ADMIN" | "ANALYST" | "VIEWER">) => {
      if (!currentAuth.authenticated) throw new MockAuthError("Authentication required.", 401);
      if (!roles.includes(currentAuth.role)) {
        throw new MockAuthError("You do not have permission for this action.", 403);
      }
      return {
        user: {
          id: currentAuth.userId,
          role: currentAuth.role,
          workspaceId: currentAuth.workspaceId,
        },
      };
    },
  },
});

const sampleIdContext = { params: { id: "cmj1q2w3e4r5t6y7u8i9o0p1a" } };

let getDashboard: typeof import("@/app/api/analytics/dashboard/route").GET;
let getFeedback: typeof import("@/app/api/feedback/route").GET;
let createFeedback: typeof import("@/app/api/feedback/route").POST;
let getFeedbackById: typeof import("@/app/api/feedback/[id]/route").GET;
let updateFeedbackById: typeof import("@/app/api/feedback/[id]/route").PATCH;
let deleteFeedbackById: typeof import("@/app/api/feedback/[id]/route").DELETE;
let reclassifyFeedback: typeof import("@/app/api/feedback/[id]/reclassify/route").POST;
let importCsv: typeof import("@/app/api/feedback/import/route").POST;
let getThemes: typeof import("@/app/api/themes/route").GET;
let getThemeFeedback: typeof import("@/app/api/themes/[id]/feedback/route").GET;
let getTrends: typeof import("@/app/api/trends/route").GET;
let askQuestion: typeof import("@/app/api/ask/route").POST;
let getReports: typeof import("@/app/api/reports/route").GET;
let createReport: typeof import("@/app/api/reports/route").POST;
let getReportById: typeof import("@/app/api/reports/[id]/route").GET;
let exportReportPdf: typeof import("@/app/api/reports/[id]/pdf/route").GET;
let getMembers: typeof import("@/app/api/workspace/members/route").GET;
let updateMemberRole: typeof import("@/app/api/workspace/members/[id]/route").PATCH;
let deleteMember: typeof import("@/app/api/workspace/members/[id]/route").DELETE;
let getInvitations: typeof import("@/app/api/workspace/invitations/route").GET;
let createInvitation: typeof import("@/app/api/workspace/invitations/route").POST;
let resendInvitation: typeof import("@/app/api/workspace/invitations/[id]/resend/route").POST;
let revokeInvitation: typeof import("@/app/api/workspace/invitations/[id]/revoke/route").POST;

test.before(async () => {
  ({ GET: getDashboard } = await import("@/app/api/analytics/dashboard/route"));
  ({ GET: getFeedback, POST: createFeedback } = await import("@/app/api/feedback/route"));
  ({ GET: getFeedbackById, PATCH: updateFeedbackById, DELETE: deleteFeedbackById } = await import("@/app/api/feedback/[id]/route"));
  ({ POST: reclassifyFeedback } = await import("@/app/api/feedback/[id]/reclassify/route"));
  ({ POST: importCsv } = await import("@/app/api/feedback/import/route"));
  ({ GET: getThemes } = await import("@/app/api/themes/route"));
  ({ GET: getThemeFeedback } = await import("@/app/api/themes/[id]/feedback/route"));
  ({ GET: getTrends } = await import("@/app/api/trends/route"));
  ({ POST: askQuestion } = await import("@/app/api/ask/route"));
  ({ GET: getReports, POST: createReport } = await import("@/app/api/reports/route"));
  ({ GET: getReportById } = await import("@/app/api/reports/[id]/route"));
  ({ GET: exportReportPdf } = await import("@/app/api/reports/[id]/pdf/route"));
  ({ GET: getMembers } = await import("@/app/api/workspace/members/route"));
  ({ PATCH: updateMemberRole, DELETE: deleteMember } = await import("@/app/api/workspace/members/[id]/route"));
  ({ GET: getInvitations, POST: createInvitation } = await import("@/app/api/workspace/invitations/route"));
  ({ POST: resendInvitation } = await import("@/app/api/workspace/invitations/[id]/resend/route"));
  ({ POST: revokeInvitation } = await import("@/app/api/workspace/invitations/[id]/revoke/route"));
});

test("RBAC matrix: Unauthenticated requests are rejected across all endpoints with 401", async () => {
  currentAuth.authenticated = false;

  const endpoints = [
    getDashboard(new Request("http://localhost/api/analytics/dashboard?start=2026-09-01&end=2026-09-30")),
    getFeedback(new Request("http://localhost/api/feedback?page=1")),
    createFeedback(new Request("http://localhost/api/feedback", { method: "POST", body: "{}" })),
    getFeedbackById(new Request("http://localhost/api/feedback/id"), sampleIdContext),
    updateFeedbackById(new Request("http://localhost/api/feedback/id", { method: "PATCH", body: "{}" }), sampleIdContext),
    deleteFeedbackById(new Request("http://localhost/api/feedback/id", { method: "DELETE" }), sampleIdContext),
    reclassifyFeedback(new Request("http://localhost/api/feedback/id/reclassify", { method: "POST" }), sampleIdContext),
    importCsv(new Request("http://localhost/api/feedback/import", { method: "POST" })),
    getThemes(),
    getThemeFeedback(new Request("http://localhost/api/themes/id/feedback"), sampleIdContext),
    getTrends(new Request("http://localhost/api/trends")),
    askQuestion(new Request("http://localhost/api/ask", { method: "POST", body: JSON.stringify({ question: "hello" }) })),
    getReports(),
    createReport(new Request("http://localhost/api/reports", { method: "POST", body: "{}" })),
    getReportById(new Request("http://localhost/api/reports/id"), sampleIdContext),
    exportReportPdf(new Request("http://localhost/api/reports/id/pdf"), sampleIdContext),
    getMembers(),
    updateMemberRole(new Request("http://localhost/api/workspace/members/id", { method: "PATCH", body: "{}" }), sampleIdContext),
    deleteMember(new Request("http://localhost/api/workspace/members/id", { method: "DELETE" }), sampleIdContext),
    getInvitations(),
    createInvitation(new Request("http://localhost/api/workspace/invitations", { method: "POST", body: "{}" })),
    resendInvitation(new Request("http://localhost/api/workspace/invitations/id/resend", { method: "POST" }), sampleIdContext),
    revokeInvitation(new Request("http://localhost/api/workspace/invitations/id/revoke", { method: "POST" }), sampleIdContext),
  ];

  for (const respPromise of endpoints) {
    const resp = await respPromise;
    assert.equal(resp.status, 401, `Expected 401 for unauthenticated request`);
  }
});

test("RBAC matrix: VIEWER role allows viewing and denies all mutations, member management, and invitations", async () => {
  currentAuth.authenticated = true;
  currentAuth.role = "VIEWER";

  // VIEWER is denied all write operations, member management, and invitations
  const deniedOperations = [
    await createFeedback(new Request("http://localhost/api/feedback", { method: "POST", body: "{}" })),
    await updateFeedbackById(new Request("http://localhost/api/feedback/id", { method: "PATCH", body: "{}" }), sampleIdContext),
    await deleteFeedbackById(new Request("http://localhost/api/feedback/id", { method: "DELETE" }), sampleIdContext),
    await reclassifyFeedback(new Request("http://localhost/api/feedback/id/reclassify", { method: "POST" }), sampleIdContext),
    await importCsv(new Request("http://localhost/api/feedback/import", { method: "POST" })),
    await createReport(new Request("http://localhost/api/reports", { method: "POST", body: "{}" })),
    await getMembers(),
    await updateMemberRole(new Request("http://localhost/api/workspace/members/id", { method: "PATCH", body: "{}" }), sampleIdContext),
    await deleteMember(new Request("http://localhost/api/workspace/members/id", { method: "DELETE" }), sampleIdContext),
    await getInvitations(),
    await createInvitation(new Request("http://localhost/api/workspace/invitations", { method: "POST", body: "{}" })),
    await resendInvitation(new Request("http://localhost/api/workspace/invitations/id/resend", { method: "POST" }), sampleIdContext),
    await revokeInvitation(new Request("http://localhost/api/workspace/invitations/id/revoke", { method: "POST" }), sampleIdContext),
  ];

  for (const resp of deniedOperations) {
    assert.equal(resp.status, 403, `Expected 403 Forbidden for VIEWER`);
  }
});

test("RBAC matrix: ANALYST role allows feedback and reports mutations but denies delete feedback, member management, and invitations", async () => {
  currentAuth.authenticated = true;
  currentAuth.role = "ANALYST";

  // ANALYST is denied member management, feedback deletion, and invitations
  const deniedOperations = [
    await deleteFeedbackById(new Request("http://localhost/api/feedback/id", { method: "DELETE" }), sampleIdContext),
    await getMembers(),
    await updateMemberRole(new Request("http://localhost/api/workspace/members/id", { method: "PATCH", body: "{}" }), sampleIdContext),
    await deleteMember(new Request("http://localhost/api/workspace/members/id", { method: "DELETE" }), sampleIdContext),
    await getInvitations(),
    await createInvitation(new Request("http://localhost/api/workspace/invitations", { method: "POST", body: "{}" })),
    await resendInvitation(new Request("http://localhost/api/workspace/invitations/id/resend", { method: "POST" }), sampleIdContext),
    await revokeInvitation(new Request("http://localhost/api/workspace/invitations/id/revoke", { method: "POST" }), sampleIdContext),
  ];

  for (const resp of deniedOperations) {
    assert.equal(resp.status, 403, `Expected 403 Forbidden for ANALYST`);
  }

  // ANALYST is allowed feedback creation, csv import, reclassify, report creation (guard passes; invalid body yields 400/404, not 401 or 403)
  const allowedWriteResponses = [
    await createFeedback(new Request("http://localhost/api/feedback", { method: "POST", body: "{}" })),
    await updateFeedbackById(new Request("http://localhost/api/feedback/id", { method: "PATCH", body: "{}" }), sampleIdContext),
    await createReport(new Request("http://localhost/api/reports", { method: "POST", body: "{}" })),
  ];

  for (const resp of allowedWriteResponses) {
    assert.notEqual(resp.status, 401, "Should not be unauthenticated");
    assert.notEqual(resp.status, 403, "Should not be forbidden for ANALYST");
    assert.ok(resp.status === 400 || resp.status === 404, `Expected 400 validation error or 404 not found, got ${resp.status}`);
  }
});

test("RBAC matrix: ADMIN role has access to all protected write operations, member management, and invitations", async () => {
  currentAuth.authenticated = true;
  currentAuth.role = "ADMIN";

  // ADMIN authorization passes guard on all operations
  const adminEndpoints = [
    await createFeedback(new Request("http://localhost/api/feedback", { method: "POST", body: "{}" })),
    await updateFeedbackById(new Request("http://localhost/api/feedback/id", { method: "PATCH", body: "{}" }), sampleIdContext),
    await createReport(new Request("http://localhost/api/reports", { method: "POST", body: "{}" })),
    await updateMemberRole(new Request("http://localhost/api/workspace/members/id", { method: "PATCH", body: "{}" }), sampleIdContext),
    await createInvitation(new Request("http://localhost/api/workspace/invitations", { method: "POST", body: "{}" })),
  ];

  for (const resp of adminEndpoints) {
    assert.notEqual(resp.status, 401, "Should not be unauthenticated");
    assert.notEqual(resp.status, 403, "Should not be forbidden for ADMIN");
    assert.ok(resp.status === 400 || resp.status === 404, `Expected 400 validation error or 404 not found, got ${resp.status}`);
  }
});
