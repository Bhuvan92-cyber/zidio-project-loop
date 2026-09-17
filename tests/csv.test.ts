import assert from "node:assert/strict";
import test from "node:test";
import { CSV_MAX_ROWS, parseCsvContent } from "@/lib/validation/csv";

test("parses quoted content containing commas", () => {
  const result = parseCsvContent('content,channel,customer_label,created_at\n"Needs faster, simpler onboarding",support_ticket,Acme,2026-09-17');
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].content, "Needs faster, simpler onboarding");
  assert.equal(result.rows[0].channel, "SUPPORT_TICKET");
  assert.equal(result.rows[0].customerLabel, "Acme");
  assert.equal(result.rows[0].createdAt?.toISOString(), "2026-09-17T00:00:00.000Z");
});

test("supports escaped quotes and CRLF rows", () => {
  const result = parseCsvContent("content,channel,customer_label,created_at\r\n\"Customer said \"\"please fix search\"\"\",community,,2026-09-17T12:30:00Z\r\n");
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].content, 'Customer said "please fix search"');
});

test("rejects missing headers, empty files, and header-only files", () => {
  assert.match(parseCsvContent("content,channel\nhello,support_ticket").errors[0].message, /Missing required/);
  assert.match(parseCsvContent("").errors[0].message, /empty/);
  assert.match(parseCsvContent("content,channel,created_at\n").errors[0].message, /no data rows/);
});

test("rejects security-context columns instead of accepting a client workspace", () => {
  const result = parseCsvContent("content,channel,created_at,workspace_id\nhello,community,2026-09-17,workspace-b");
  assert.match(result.errors[0].message, /Unexpected CSV header/);
});

test("rejects invalid rows without returning partial records", () => {
  const result = parseCsvContent("content,channel,created_at\nhello,invalid,2026-09-17\n,community,2026-09-17\nvalid,community,not-a-date");
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 3);
});

test("rejects impossible dates and accepts optional customer labels", () => {
  const invalid = parseCsvContent("content,channel,created_at\nhello,community,2026-02-30");
  assert.equal(invalid.errors.length, 1);
  const valid = parseCsvContent("content,channel,customer_label,created_at\nhello,community,,2026-09-17");
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.rows[0].customerLabel, null);
});

test("enforces the canonical 160-character customer label limit", () => {
  const accepted = parseCsvContent(`content,channel,customer_label,created_at\nhello,community,${"a".repeat(160)},2026-09-17`);
  assert.equal(accepted.errors.length, 0);
  assert.equal(accepted.rows[0].customerLabel?.length, 160);

  const rejected = parseCsvContent(`content,channel,customer_label,created_at\nhello,community,${"a".repeat(161)},2026-09-17`);
  assert.equal(rejected.rows.length, 0);
  assert.match(rejected.errors[0].message, /customer_label exceeds the 160 character limit/);
});

test("rejects excessive row counts", () => {
  const rows = Array.from({ length: CSV_MAX_ROWS + 1 }, (_, index) => `feedback ${index},community,2026-09-17`).join("\n");
  const result = parseCsvContent(`content,channel,created_at\n${rows}`);
  assert.match(result.errors[0].message, /row limit/);
});
