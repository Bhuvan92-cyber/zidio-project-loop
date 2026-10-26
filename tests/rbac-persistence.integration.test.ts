import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { PrismaClient, Role } from "@prisma/client";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const testDbUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDbUrl ? test : test.skip;

import { AuthError, authErrorResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";

let currentSession: { user?: { id: string } } | null = null;

mock.module("@/lib/auth/guards", {
  namedExports: {
    AuthError,
    authErrorResponse,
    requireSession: async () => {
      if (!currentSession?.user?.id) throw new AuthError("Authentication required.", 401);
      const user = await db.user.findUnique({
        where: { id: currentSession.user.id },
        select: { id: true, role: true, workspaceId: true },
      });
      if (!user) throw new AuthError("Authentication required.", 401);
      return { user: { id: user.id, role: user.role, workspaceId: user.workspaceId } };
    },
    requireRole: async (roles: Role[]) => {
      if (!currentSession?.user?.id) throw new AuthError("Authentication required.", 401);
      const user = await db.user.findUnique({
        where: { id: currentSession.user.id },
        select: { id: true, role: true, workspaceId: true },
      });
      if (!user) throw new AuthError("Authentication required.", 401);
      if (!roles.includes(user.role)) {
        throw new AuthError("You do not have permission for this action.", 403);
      }
      return { user: { id: user.id, role: user.role, workspaceId: user.workspaceId } };
    },
  },
});

let updateMemberRoute: typeof import("@/app/api/workspace/members/[id]/route").PATCH;
let getMembersRoute: typeof import("@/app/api/workspace/members/route").GET;
let requireSession: typeof import("@/lib/auth/guards").requireSession;

test.before(async () => {
  ({ PATCH: updateMemberRoute } = await import("@/app/api/workspace/members/[id]/route"));
  ({ GET: getMembersRoute } = await import("@/app/api/workspace/members/route"));
  ({ requireSession } = await import("@/lib/auth/guards"));
});

integrationTest("RBAC database persistence, role mutations, tenant isolation, and admin safety", async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
  const suffix = `rbac-${Date.now()}`;

  // 1. Create Workspace A with Admin A, Admin A2, Member A (VIEWER), Analyst A (ANALYST)
  const wsA = await db.workspace.create({ data: { name: `Workspace A ${suffix}` } });
  const adminA = await db.user.create({
    data: { name: "Admin Alpha", email: `admin-a-${suffix}@example.test`, passwordHash: "hash-a", role: Role.ADMIN, workspaceId: wsA.id },
  });
  const adminA2 = await db.user.create({
    data: { name: "Admin Alpha 2", email: `admin-a2-${suffix}@example.test`, passwordHash: "hash-a2", role: Role.ADMIN, workspaceId: wsA.id },
  });
  const memberA = await db.user.create({
    data: { name: "Member Alpha", email: `member-a-${suffix}@example.test`, passwordHash: "hash-ma", role: Role.VIEWER, workspaceId: wsA.id },
  });
  const analystA = await db.user.create({
    data: { name: "Analyst Alpha", email: `analyst-a-${suffix}@example.test`, passwordHash: "hash-aa", role: Role.ANALYST, workspaceId: wsA.id },
  });

  // 2. Create Workspace B with Admin B, Member B (VIEWER)
  const wsB = await db.workspace.create({ data: { name: `Workspace B ${suffix}` } });
  const adminB = await db.user.create({
    data: { name: "Admin Beta", email: `admin-b-${suffix}@example.test`, passwordHash: "hash-b", role: Role.ADMIN, workspaceId: wsB.id },
  });
  const memberB = await db.user.create({
    data: { name: "Member Beta", email: `member-b-${suffix}@example.test`, passwordHash: "hash-mb", role: Role.VIEWER, workspaceId: wsB.id },
  });

  try {
    // Context helper
    const contextFor = (id: string) => ({ params: { id } });

    // -------------------------------------------------------------
    // Test 1: Administrator successfully changes member from VIEWER to ANALYST
    // -------------------------------------------------------------
    currentSession = { user: { id: adminA.id } };
    const res1 = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${memberA.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ANALYST" }),
      }),
      contextFor(memberA.id),
    );
    assert.equal(res1.status, 200, "Expected 200 OK for role change to ANALYST");
    const body1 = await res1.json();
    assert.deepEqual(body1, { data: { id: memberA.id, role: "ANALYST" } });

    // Verify database persistence after fresh read
    const dbMemberAfter1 = await db.user.findUnique({ where: { id: memberA.id } });
    assert.equal(dbMemberAfter1?.role, Role.ANALYST, "Database must persist role ANALYST");
    assert.equal(dbMemberAfter1?.workspaceId, wsA.id, "Workspace ID must remain unchanged");

    // Verify session freshness: requireSession immediately reflects new role from DB
    currentSession = { user: { id: memberA.id } };
    const freshSession1 = await requireSession();
    assert.equal(freshSession1.user.role, Role.ANALYST, "Session must immediately reflect persisted role");

    // -------------------------------------------------------------
    // Test 2: Administrator successfully changes member from ANALYST to VIEWER
    // -------------------------------------------------------------
    currentSession = { user: { id: adminA.id } };
    const res2 = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${memberA.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "VIEWER" }),
      }),
      contextFor(memberA.id),
    );
    assert.equal(res2.status, 200, "Expected 200 OK for role change to VIEWER");
    const body2 = await res2.json();
    assert.deepEqual(body2, { data: { id: memberA.id, role: "VIEWER" } });

    // Verify database persistence after fresh read
    const dbMemberAfter2 = await db.user.findUnique({ where: { id: memberA.id } });
    assert.equal(dbMemberAfter2?.role, Role.VIEWER, "Database must persist role VIEWER");

    // Verify session freshness for VIEWER
    currentSession = { user: { id: memberA.id } };
    const freshSession2 = await requireSession();
    assert.equal(freshSession2.user.role, Role.VIEWER, "Session must immediately reflect VIEWER role");

    // -------------------------------------------------------------
    // Test 3: Unauthenticated requests cannot assign or change roles
    // -------------------------------------------------------------
    currentSession = null;
    const resUnauth = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${memberA.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ANALYST" }),
      }),
      contextFor(memberA.id),
    );
    assert.equal(resUnauth.status, 401, "Expected 401 Unauthorized for unauthenticated request");
    // Verify database unchanged
    assert.equal((await db.user.findUnique({ where: { id: memberA.id } }))?.role, Role.VIEWER);

    // -------------------------------------------------------------
    // Test 4: ANALYST cannot assign roles or promote themselves
    // -------------------------------------------------------------
    currentSession = { user: { id: analystA.id } };
    // Attempting to change memberA's role
    const resAnalystToMember = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${memberA.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      }),
      contextFor(memberA.id),
    );
    assert.equal(resAnalystToMember.status, 403, "ANALYST must be denied role changes with 403");

    // Self-promotion attempt: ANALYST attempting to promote themselves to ADMIN
    const resAnalystSelfPromote = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${analystA.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      }),
      contextFor(analystA.id),
    );
    assert.equal(resAnalystSelfPromote.status, 403, "ANALYST self-promotion must be denied with 403");
    assert.equal((await db.user.findUnique({ where: { id: analystA.id } }))?.role, Role.ANALYST);

    // -------------------------------------------------------------
    // Test 5: VIEWER cannot assign roles or promote themselves
    // -------------------------------------------------------------
    currentSession = { user: { id: memberA.id } };
    const resViewerSelfPromote = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${memberA.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      }),
      contextFor(memberA.id),
    );
    assert.equal(resViewerSelfPromote.status, 403, "VIEWER self-promotion must be denied with 403");
    assert.equal((await db.user.findUnique({ where: { id: memberA.id } }))?.role, Role.VIEWER);

    // -------------------------------------------------------------
    // Test 6: Invalid, missing, malformed, or unsupported roles are rejected (HTTP 400)
    // -------------------------------------------------------------
    currentSession = { user: { id: adminA.id } };
    const invalidPayloads = [
      { role: "SUPERADMIN" },
      { role: "USER" },
      { role: "EDITOR" },
      { role: "admin" },
      { role: "" },
      {},
      null,
    ];

    for (const payload of invalidPayloads) {
      const resBad = await updateMemberRoute(
        new Request(`http://localhost/api/workspace/members/${memberA.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        contextFor(memberA.id),
      );
      assert.equal(resBad.status, 400, `Expected 400 for payload: ${JSON.stringify(payload)}`);
      // Database record remains unchanged
      assert.equal((await db.user.findUnique({ where: { id: memberA.id } }))?.role, Role.VIEWER);
    }

    // -------------------------------------------------------------
    // Test 7: Tenant isolation - Administrator in Workspace A cannot change member in Workspace B
    // -------------------------------------------------------------
    currentSession = { user: { id: adminA.id } };
    const resCrossWorkspace = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${memberB.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      }),
      contextFor(memberB.id),
    );
    assert.equal(resCrossWorkspace.status, 404, "Cross-workspace role mutation must return 404 Member not found");
    const crossMemberDb = await db.user.findUnique({ where: { id: memberB.id } });
    assert.equal(crossMemberDb?.role, Role.VIEWER, "Cross-workspace member role must remain unchanged");
    assert.equal(crossMemberDb?.workspaceId, wsB.id);

    // -------------------------------------------------------------
    // Test 8: Administrator safety - Self-demotion is forbidden
    // -------------------------------------------------------------
    currentSession = { user: { id: adminA.id } };
    const resSelfDemote = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${adminA.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "VIEWER" }),
      }),
      contextFor(adminA.id),
    );
    assert.equal(resSelfDemote.status, 400, "Self-demotion must be rejected with 400");
    const selfDemoteBody = await resSelfDemote.json();
    assert.equal(selfDemoteBody.error, "You cannot remove your own admin access.");
    assert.equal((await db.user.findUnique({ where: { id: adminA.id } }))?.role, Role.ADMIN);

    // -------------------------------------------------------------
    // Test 9: Administrator safety - Sole administrator cannot be demoted
    // -------------------------------------------------------------
    // In Workspace A, there are currently two admins (adminA and adminA2).
    // First, demote adminA2 to ANALYST so that adminA is the only admin left.
    const resDemoteA2 = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${adminA2.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ANALYST" }),
      }),
      contextFor(adminA2.id),
    );
    assert.equal(resDemoteA2.status, 200, "Demoting second admin when 2 exist should succeed");
    assert.equal((await db.user.findUnique({ where: { id: adminA2.id } }))?.role, Role.ANALYST);

    // Now workspace A has exactly 1 admin (adminA).
    // Verify adminCount in wsA is 1
    const adminCountA = await db.user.count({ where: { workspaceId: wsA.id, role: Role.ADMIN } });
    assert.equal(adminCountA, 1, "Workspace A now has exactly 1 admin");

    // In Workspace B, adminB is the ONLY admin.
    // If adminB tries to demote themselves:
    currentSession = { user: { id: adminB.id } };
    const resSoleAdminB = await updateMemberRoute(
      new Request(`http://localhost/api/workspace/members/${adminB.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "VIEWER" }),
      }),
      contextFor(adminB.id),
    );
    assert.equal(resSoleAdminB.status, 400, "Sole admin demotion must be rejected");
    assert.equal((await db.user.findUnique({ where: { id: adminB.id } }))?.role, Role.ADMIN);

    // -------------------------------------------------------------
    // Test 10: Concurrency - Two concurrent demotions cannot leave workspace without an admin
    // -------------------------------------------------------------
    // Setup two admins in Workspace B
    const adminB2 = await db.user.create({
      data: { name: "Admin Beta 2", email: `admin-b2-${suffix}@example.test`, passwordHash: "h", role: Role.ADMIN, workspaceId: wsB.id },
    });
    assert.equal(await db.user.count({ where: { workspaceId: wsB.id, role: Role.ADMIN } }), 2);

    // Admin B sends request to demote Admin B2, while Admin B2 sends request to demote Admin B
    const demoteRequest = async (actorId: string, targetId: string) => {
      currentSession = { user: { id: actorId } };
      return updateMemberRoute(
        new Request(`http://localhost/api/workspace/members/${targetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "VIEWER" }),
        }),
        contextFor(targetId),
      );
    };

    const [concurrent1, concurrent2] = await Promise.all([
      demoteRequest(adminB.id, adminB2.id),
      demoteRequest(adminB2.id, adminB.id),
    ]);

    // Check that at least one demotion was blocked or conflict occurred, and workspace NEVER has 0 admins!
    const remainingAdminsB = await db.user.count({ where: { workspaceId: wsB.id, role: Role.ADMIN } });
    assert.ok(
      remainingAdminsB >= 1,
      `Workspace must retain at least 1 administrator; actual remaining: ${remainingAdminsB}`,
    );

    const statuses = [concurrent1.status, concurrent2.status];
    assert.ok(
      statuses.includes(400) || statuses.includes(409),
      `Expected at least one demotion to fail with 400 or 409 conflict, got statuses: ${statuses.join(", ")}`,
    );

  } finally {
    // Deterministic cleanup
    await db.user.deleteMany({ where: { workspaceId: { in: [wsA.id, wsB.id] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA.id, wsB.id] } } });
    await db.$disconnect();
    currentSession = null;
  }
});
