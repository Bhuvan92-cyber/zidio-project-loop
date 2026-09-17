import assert from "node:assert/strict";
import test, { mock } from "node:test";

class TestAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

mock.module("@/lib/auth/guards", {
  namedExports: {
    AuthError: TestAuthError,
    authErrorResponse: (error: unknown) => {
      const authError = error instanceof TestAuthError ? error : new TestAuthError("Authentication required.", 401);
      return Response.json({ error: authError.message }, { status: authError.status });
    },
    requireSession: async () => {
      if (!authenticated) throw new TestAuthError("Authentication required.", 401);
      return sessionForRole();
    },
    requireRole: async (roles: Array<"ADMIN" | "ANALYST" | "VIEWER">) => {
      if (!authenticated) throw new TestAuthError("Authentication required.", 401);
      if (!roles.includes(role)) throw new TestAuthError("You do not have permission for this action.", 403);
      return sessionForRole();
    },
  },
});

const context = { params: { id: "cmj1q2w3e4r5t6y7u8i9o0p1a" } };

let authenticated = false;
let role: "ADMIN" | "ANALYST" | "VIEWER" = "VIEWER";

function sessionForRole() {
  return { user: { id: "authenticated-user", role, workspaceId: "workspace-a" } };
}

let getFeedback: typeof import("@/app/api/feedback/route").GET;
let getDashboard: typeof import("@/app/api/analytics/dashboard/route").GET;
let createFeedback: typeof import("@/app/api/feedback/route").POST;
let getFeedbackById: typeof import("@/app/api/feedback/[id]/route").GET;
let updateFeedbackById: typeof import("@/app/api/feedback/[id]/route").PATCH;
let importCsv: typeof import("@/app/api/feedback/import/route").POST;
let getThemes: typeof import("@/app/api/themes/route").GET;
let getThemeFeedback: typeof import("@/app/api/themes/[id]/feedback/route").GET;
let reclassify: typeof import("@/app/api/feedback/[id]/reclassify/route").POST;
let ask: typeof import("@/app/api/ask/route").POST;
let getTrends: typeof import("@/app/api/trends/route").GET;
let getReports: typeof import("@/app/api/reports/route").GET;
let createReport: typeof import("@/app/api/reports/route").POST;
let getReport: typeof import("@/app/api/reports/[id]/route").GET;
let getMembers: typeof import("@/app/api/workspace/members/route").GET;
let updateMember: typeof import("@/app/api/workspace/members/[id]/route").PATCH;

test.before(async () => {
  ({ GET: getFeedback, POST: createFeedback } = await import("@/app/api/feedback/route"));
  ({ GET: getDashboard } = await import("@/app/api/analytics/dashboard/route"));
  ({ GET: getFeedbackById, PATCH: updateFeedbackById } = await import("@/app/api/feedback/[id]/route"));
  ({ POST: importCsv } = await import("@/app/api/feedback/import/route"));
  ({ GET: getThemes } = await import("@/app/api/themes/route"));
  ({ GET: getThemeFeedback } = await import("@/app/api/themes/[id]/feedback/route"));
  ({ POST: reclassify } = await import("@/app/api/feedback/[id]/reclassify/route"));
  ({ POST: ask } = await import("@/app/api/ask/route"));
  ({ GET: getTrends } = await import("@/app/api/trends/route"));
  ({ GET: getReports, POST: createReport } = await import("@/app/api/reports/route"));
  ({ GET: getReport } = await import("@/app/api/reports/[id]/route"));
  ({ GET: getMembers } = await import("@/app/api/workspace/members/route"));
  ({ PATCH: updateMember } = await import("@/app/api/workspace/members/[id]/route"));
});

test("protected read routes reject unauthenticated requests", async () => {
  for (const response of [
    await getDashboard(new Request("http://localhost/api/analytics/dashboard?start=2026-09-01&end=2026-09-30")),
    await getFeedback(new Request("http://localhost/api/feedback?page=1")),
    await getFeedbackById(new Request("http://localhost/api/feedback/id"), context),
    await getThemes(),
    await getThemeFeedback(new Request("http://localhost/api/themes/id/feedback"), context),
    await getTrends(new Request("http://localhost/api/trends")),
    await ask(new Request("http://localhost/api/ask", { method: "POST", body: JSON.stringify({ question: "What do customers want?" }) })),
    await getReports(),
    await getReport(new Request("http://localhost/api/reports/id"), context),
    await getMembers(),
  ]) assert.equal(response.status, 401);
});

test("protected write routes reject unauthenticated requests before mutation", async () => {
  const create = await createFeedback(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify({ content: "test", channel: "COMMUNITY" }) }));
  const rerun = await reclassify(new Request("http://localhost/api/feedback/id/reclassify", { method: "POST" }), context);
  const report = await createReport(new Request("http://localhost/api/reports", { method: "POST", body: JSON.stringify({ periodStart: "2026-09-01", periodEnd: "2026-09-30" }) }));
  assert.equal(create.status, 401);
  assert.equal(rerun.status, 401);
  assert.equal(report.status, 401);
});

test("authenticated role boundaries are enforced by the route handlers", async () => {
  authenticated = true;
  role = "VIEWER";

  for (const response of [
    await createFeedback(new Request("http://localhost/api/feedback", { method: "POST", body: "{}" }),),
    await importCsv(new Request("http://localhost/api/feedback/import", { method: "POST" })),
    await reclassify(new Request("http://localhost/api/feedback/id/reclassify", { method: "POST", body: "{}" }), context),
    await updateFeedbackById(new Request("http://localhost/api/feedback/id", { method: "PATCH", body: "{}" }), context),
    await createReport(new Request("http://localhost/api/reports", { method: "POST", body: "{}" })),
  ]) {
    assert.equal(response.status, 403);
  }

  role = "ANALYST";
  assert.equal((await getMembers()).status, 403);
  assert.equal(
    (await updateMember(new Request("http://localhost/api/workspace/members/id", { method: "PATCH", body: "{}" }), context)).status,
    403,
  );

  role = "ADMIN";
  assert.equal(
    (await createFeedback(new Request("http://localhost/api/feedback", { method: "POST", body: "{}" }))).status,
    400,
  );
  assert.equal(
    (await createReport(new Request("http://localhost/api/reports", { method: "POST", body: "{}" }))).status,
    400,
  );

  authenticated = false;
});
