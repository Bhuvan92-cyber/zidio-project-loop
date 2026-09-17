import assert from "node:assert/strict";
import test from "node:test";
import { createReportPdf } from "@/lib/reports/pdf";

test("report PDF includes the saved report sections", () => {
  const pdf = createReportPdf({
    title: "Voice of Customer: test",
    periodStart: new Date("2026-09-01T00:00:00Z"),
    periodEnd: new Date("2026-09-30T00:00:00Z"),
    createdAt: new Date("2026-09-18T00:00:00Z"),
    contentJson: {
      executiveSummary: "Summary",
      topThemes: [{ name: "Reliability", insight: "Customers want fewer failures." }],
      sentimentShifts: ["Sentiment is improving."],
      notableQuotes: [{ quote: "It is much faster.", sourceId: "feedback-1" }],
      recommendedActions: ["Prioritize reliability."],
      supportingEvidence: ["Evidence from recent feedback."],
    },
  });
  const output = new TextDecoder().decode(pdf);
  assert.equal(output.startsWith("%PDF-1.4"), true);
  for (const value of ["Executive summary", "VoC findings / top themes", "Sentiment and classification", "Recommendations / actions", "Supporting evidence / insights"]) assert.match(output, new RegExp(value.replace(/[/?]/g, "\\$&")));
});
