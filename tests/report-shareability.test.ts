import assert from "node:assert/strict";
import test from "node:test";
import { reportPath } from "@/lib/ai/report-links";

test("saved reports use stable report-specific paths", () => {
  assert.equal(reportPath("report-a"), "/reports/report-a");
  assert.equal(reportPath("report with spaces"), "/reports/report%20with%20spaces");
});
