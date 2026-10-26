import assert from "node:assert/strict";
import test from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const testDbUrl = process.env.TEST_DATABASE_URL;
const integration = testDbUrl ? test : test.skip;
const E2E_PORT = 3009;
const BASE_URL = `http://localhost:${E2E_PORT}`;

integration("RBAC E2E browser flow: role reassignment, persistence, session freshness, invitations, and member removal", { timeout: 120_000 }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
  const suffix = `e2e-${Date.now()}`;
  const password = "password123!";
  const passwordHash = await bcrypt.hash(password, 10);

  // Create isolated test workspace and users
  const ws = await db.workspace.create({ data: { name: `E2E Workspace ${suffix}` } });
  const adminEmail = `admin-${suffix}@example.test`;
  const admin = await db.user.create({
    data: { name: "Admin Test", email: adminEmail, passwordHash, role: Role.ADMIN, workspaceId: ws.id },
  });
  const memberEmail = `member-${suffix}@example.test`;
  const member = await db.user.create({
    data: { name: "Member Test", email: memberEmail, passwordHash, role: Role.VIEWER, workspaceId: ws.id },
  });

  let serverProcess: ChildProcess | null = null;
  let browser: Browser | null = null;

  try {
    // 1. Start Next.js production server on E2E_PORT with test database env
    const nextBin = require.resolve("next/dist/bin/next");
    serverProcess = spawn(
      process.execPath,
      [nextBin, "start", "-p", String(E2E_PORT)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(E2E_PORT),
          DATABASE_URL: testDbUrl,
          DIRECT_URL: testDbUrl,
          NEXTAUTH_URL: BASE_URL,
          NEXTAUTH_SECRET: "e2e-secret-key-1234567890-test-key",
          ENABLE_TEST_EMAIL_MOCK: "true",
          NODE_ENV: "production",
        },
        stdio: "pipe",
      },
    );

    // Wait for the server to be ready
    const startTime = Date.now();
    let ready = false;
    while (Date.now() - startTime < 30_000) {
      try {
        const res = await fetch(`${BASE_URL}/login`);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // Wait and retry
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Next.js server failed to become ready on port " + E2E_PORT);

    // 2. Launch headless Chromium browser
    browser = await chromium.launch({ headless: true });

    // -------------------------------------------------------------------------
    // Step 1: Log in as an administrator
    // -------------------------------------------------------------------------
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${BASE_URL}/login`);
    await adminPage.fill('input[type="email"]', adminEmail);
    await adminPage.fill('input[type="password"]', password);
    await adminPage.click('button[type="submit"]');

    // Wait for redirect away from /login
    await adminPage.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });

    // Verify navigation sidebar on dashboard contains "Workspace Members" for ADMIN
    await adminPage.goto(`${BASE_URL}/`);
    await adminPage.waitForSelector('h1:has-text("Your feedback pulse.")');
    const membersNavLink = adminPage.locator('nav a:has-text("Workspace Members")');
    await membersNavLink.first().waitFor({ state: "visible" });
    assert.ok(await membersNavLink.first().isVisible(), "Sidebar must show Workspace Members link for ADMIN");

    // -------------------------------------------------------------------------
    // Step 2: Open the member-management screen (/settings) via link
    // -------------------------------------------------------------------------
    await membersNavLink.first().click();
    await adminPage.waitForSelector('h1:has-text("Workspace members")');

    // -------------------------------------------------------------------------
    // Step 3 & 4: Locate test member and change member's role (VIEWER -> ANALYST)
    // -------------------------------------------------------------------------
    const memberSelect = adminPage.locator(`select[aria-label="Role for ${member.name}"]`);
    await memberSelect.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await memberSelect.inputValue(), "VIEWER", "Initial role in UI should be VIEWER");

    // Change member's role to ANALYST and wait for PATCH response
    const [responseAnalyst] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().includes(`/api/workspace/members/${member.id}`) && res.status() === 200),
      memberSelect.selectOption("ANALYST"),
    ]);

    // Step 5: Verify the mutation response and success banner
    const resBodyAnalyst = await responseAnalyst.json();
    assert.deepEqual(resBodyAnalyst, { data: { id: member.id, role: "ANALYST" } });
    assert.equal(await memberSelect.inputValue(), "ANALYST");
    await adminPage.waitForSelector('p[role="status"]:has-text("Updated Member Test to ANALYST.")');

    // Verify database directly
    const dbMember1 = await db.user.findUnique({ where: { id: member.id } });
    assert.equal(dbMember1?.role, Role.ANALYST, "Database must store updated role ANALYST");

    // Step 6: Refresh the page and confirm the selected role persists
    await adminPage.reload();
    await memberSelect.waitFor({ state: "visible" });
    assert.equal(await memberSelect.inputValue(), "ANALYST", "Role must persist as ANALYST after reload");

    // -------------------------------------------------------------------------
    // Step 7: Invite a new member via the Invite Member UI
    // -------------------------------------------------------------------------
    const inviteBtn = adminPage.locator('button:has-text("+ Invite Member")');
    await inviteBtn.click();
    await adminPage.waitForSelector('h2:has-text("Invite a new workspace member")');

    const inviteeEmail = `new-colleague-${suffix}@example.test`;
    await adminPage.fill('input[placeholder="colleague@example.com"]', inviteeEmail);
    // Role selector in modal defaults to ANALYST

    const [inviteRes] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().includes("/api/workspace/invitations") && res.request().method() === "POST"),
      adminPage.click('button:has-text("Send Invitation")'),
    ]);
    assert.equal(inviteRes.status(), 201, "Invitation API should return 201 Created");
    await adminPage.waitForSelector(`p[role="status"]:has-text("Invitation sent to ${inviteeEmail}")`);

    // Verify pending invitation is displayed in the list
    await adminPage.waitForSelector(`p:has-text("${inviteeEmail}")`);

    // -------------------------------------------------------------------------
    // Step 8: Sign in as member in a separate browser context
    // Verify Workspace Members navigation link is NOT rendered for non-admins
    // -------------------------------------------------------------------------
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`${BASE_URL}/login`);
    await memberPage.fill('input[type="email"]', memberEmail);
    await memberPage.fill('input[type="password"]', password);
    await memberPage.click('button[type="submit"]');
    await memberPage.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });

    // Navigate to dashboard and verify "Workspace Members" is absent from navigation
    await memberPage.goto(`${BASE_URL}/`);
    await memberPage.waitForSelector('h1:has-text("Your feedback pulse.")');
    const memberNavCount = await memberPage.locator('nav a:has-text("Workspace Members")').count();
    assert.equal(memberNavCount, 0, "Workspace Members link must be absent for non-admins");

    // Direct navigation by member to /settings is denied
    await memberPage.goto(`${BASE_URL}/settings`);
    await memberPage.waitForSelector('p[role="alert"]:has-text("Only workspace admins can manage members.")');

    // -------------------------------------------------------------------------
    // Step 9: In admin context, remove member using the confirmation dialog
    // -------------------------------------------------------------------------
    const removeBtn = adminPage.locator(`button[aria-label="Remove ${member.name}"]`);
    await removeBtn.click();
    await adminPage.waitForSelector('h3:has-text("Confirm Member Removal")');

    const [removeRes] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().includes(`/api/workspace/members/${member.id}`) && res.request().method() === "DELETE"),
      adminPage.click('button:has-text("Remove Member")'),
    ]);
    assert.equal(removeRes.status(), 200, "DELETE member should return 200");
    await adminPage.waitForSelector(`p[role="status"]:has-text("Removed ${member.name} from the workspace.")`);

    // Verify member is removed from DB active membership
    const dbRemovedMember = await db.user.findUnique({ where: { id: member.id } });
    assert.equal(dbRemovedMember?.membershipStatus, "REVOKED", "Database membership status must be REVOKED");

    // Clean up browser contexts
    await memberContext.close();
    await adminContext.close();
  } finally {
    if (browser) await browser.close();
    if (serverProcess?.pid) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/F", "/T", "/PID", String(serverProcess.pid)], { stdio: "ignore" });
        } else {
          serverProcess.kill("SIGKILL");
        }
      } catch {
        // ignore
      }
    }
    // Clean up test data
    await db.workspaceInvitation.deleteMany({ where: { workspaceId: ws.id } });
    await db.feedbackTheme.deleteMany({ where: { workspaceId: ws.id } });
    await db.feedback.deleteMany({ where: { workspaceId: ws.id } });
    await db.user.deleteMany({ where: { workspaceId: ws.id } });
    await db.workspace.deleteMany({ where: { id: ws.id } });
    await db.$disconnect();
  }
});
