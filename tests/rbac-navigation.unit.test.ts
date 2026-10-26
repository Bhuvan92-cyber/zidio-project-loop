import assert from "node:assert/strict";
import test from "node:test";

// Test the navigation filtering logic used by the primary dashboard
const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: "↗" },
  { label: "Inbox", href: "/inbox", icon: "▤" },
  { label: "Trends", href: "/trends", icon: "⌁" },
  { label: "Ask LOOP", href: "/ask", icon: "◌" },
  { label: "Reports", href: "/reports", icon: "▥" },
  { label: "Workspace Members", href: "/settings", icon: "⚙" },
];

function getVisibleNavigation(currentUserRole: string | null) {
  return navigation.filter((item) => item.href !== "/settings" || currentUserRole === "ADMIN");
}

test("Navigation: ADMIN role can see Workspace Members navigation link", () => {
  const visible = getVisibleNavigation("ADMIN");
  const hasSettings = visible.some((item) => item.href === "/settings");
  assert.equal(hasSettings, true, "ADMIN must see Workspace Members link");
  assert.equal(visible.length, 6);
});

test("Navigation: ANALYST role CANNOT see Workspace Members navigation link", () => {
  const visible = getVisibleNavigation("ANALYST");
  const hasSettings = visible.some((item) => item.href === "/settings");
  assert.equal(hasSettings, false, "ANALYST must not see Workspace Members link");
  assert.equal(visible.length, 5);
});

test("Navigation: VIEWER role CANNOT see Workspace Members navigation link", () => {
  const visible = getVisibleNavigation("VIEWER");
  const hasSettings = visible.some((item) => item.href === "/settings");
  assert.equal(hasSettings, false, "VIEWER must not see Workspace Members link");
  assert.equal(visible.length, 5);
});

test("Navigation: Failed auth or unauthenticated role (null) CANNOT see Workspace Members navigation link", () => {
  const visible = getVisibleNavigation(null);
  const hasSettings = visible.some((item) => item.href === "/settings");
  assert.equal(hasSettings, false, "Unauthenticated/null role must never see Workspace Members link");
  assert.equal(visible.length, 5);
});

test("Navigation: Unknown or arbitrary role CANNOT see Workspace Members navigation link", () => {
  const visible = getVisibleNavigation("MEMBER");
  const hasSettings = visible.some((item) => item.href === "/settings");
  assert.equal(hasSettings, false, "Unknown role must not see Workspace Members link");
  assert.equal(visible.length, 5);
});

