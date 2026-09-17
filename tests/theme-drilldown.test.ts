import assert from "node:assert/strict";
import test from "node:test";
import { themeDrilldownPath } from "@/lib/analytics/theme-links";

test("theme drill-down navigates to the authenticated Inbox with its theme filter", () => {
  const path = themeDrilldownPath("cmj1q2w3e4r5t6y7u8i9o0p1a");
  assert.equal(path, "/inbox?themeId=cmj1q2w3e4r5t6y7u8i9o0p1a");
  assert.equal(path.startsWith("/api/"), false);
});
