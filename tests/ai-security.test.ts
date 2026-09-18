import assert from "node:assert/strict";
import test from "node:test";
import { classificationSchema, groundedAnswerSchema, reportNarrativeSchema } from "@/lib/ai/schemas";
import { cosineSimilarity } from "@/lib/ai/embeddings";
import { enforceGrounding } from "@/lib/ai/qa";
import { GeminiProvider, parseModelJson } from "@/lib/ai/provider";
import { statusAfterClassification } from "@/lib/ai/classifier";
import { answerQuestion } from "@/lib/ai/qa";
import { AIProviderError, isProviderUnavailableError } from "@/lib/ai/errors";

const source = { id: "feedback-a", content: "Users want faster onboarding.", customerLabel: "Acme", channel: "SUPPORT_TICKET", score: 0.9 };

test("AI schemas reject incomplete structured model output", () => {
  assert.equal(classificationSchema.safeParse({ sentiment: "POS", sentimentScore: 2, themes: [], featureArea: "", rationale: "" }).success, false);
  assert.equal(groundedAnswerSchema.safeParse({ answer: "ok", sourceIds: ["feedback-a"], insufficientEvidence: false }).success, true);
  assert.equal(reportNarrativeSchema.safeParse({ executiveSummary: "summary", topThemes: [], sentimentShifts: [], notableQuotes: [], recommendedActions: [], supportingEvidence: [] }).success, true);
});

test("Ask LOOP removes citations outside retrieved feedback", () => {
  const safe = enforceGrounding({ answer: "Unsupported claim", sourceIds: ["feedback-a", "workspace-b-feedback"], insufficientEvidence: false }, [source]);
  assert.deepEqual(safe.sourceIds, ["feedback-a"]);
  assert.equal(safe.insufficientEvidence, false);
});

test("Ask LOOP explicitly rejects answers with no grounded sources", () => {
  const safe = enforceGrounding({ answer: "Invented answer", sourceIds: ["unknown"], insufficientEvidence: false }, [source]);
  assert.equal(safe.insufficientEvidence, true);
  assert.match(safe.answer, /does not contain sufficient evidence/);
});

test("embedding similarity is deterministic", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("Ask LOOP surfaces embedding-provider failure instead of fabricating an answer", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(() => answerQuestion("workspace-a", "What do customers want?"), /embedding provider is not configured/);
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
});

test("Gemini provider validates structured output and retries a transient failure", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let attempts = 0;
  const provider = new GeminiProvider(() => ({ models: { generateContent: async () => { attempts += 1; if (attempts === 1) throw new Error("temporary failure"); return { text: "```json\n{\"value\":\"ok\",\"rationale\":\"validated\"}\n```" }; } } }));
  const result = await provider.complete({ system: "Return JSON.", user: "test", schema: classificationSchema.pick({ rationale: true }).extend({ value: classificationSchema.shape.rationale }) });
  assert.equal(attempts, 2);
  assert.equal(result.value, "ok");
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
});

test("Gemini provider rejects malformed JSON after its retry", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let attempts = 0;
  const provider = new GeminiProvider(() => ({ models: { generateContent: async () => { attempts += 1; return { text: "not-json" }; } } }));
  await assert.rejects(() => provider.complete({ system: "Return JSON.", user: "test", schema: classificationSchema.pick({ rationale: true }) }));
  assert.equal(attempts, 2);
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
});

test("Gemini provider maps temporary unavailability to a bounded 503 error", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let attempts = 0;
  const provider = new GeminiProvider(() => ({ models: { generateContent: async () => { attempts += 1; const error = new Error("503 UNAVAILABLE"); Object.assign(error, { status: 503 }); throw error; } } }));
  await assert.rejects(() => provider.complete({ system: "Return JSON.", user: "test", schema: classificationSchema.pick({ rationale: true }) }), (error: unknown) => error instanceof AIProviderError && error.status === 503 && error.kind === "unavailable");
  assert.equal(attempts, 2);
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
});

test("Gemini provider maps truncated structured output to a safe 502 error", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const provider = new GeminiProvider(() => ({
    models: {
      generateContent: async () => ({ text: '{"rationale":"unterminated' }),
    },
  }));
  await assert.rejects(() => provider.complete({ system: "Return JSON.", user: "test", schema: classificationSchema.pick({ rationale: true }) }), (error: unknown) => error instanceof AIProviderError && error.status === 502 && error.kind === "invalid-response");
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
});

test("model JSON parser removes optional markdown fences", () => {
  assert.deepEqual(parseModelJson("```json\n{\"ok\":true}\n```"), { ok: true });
});

test("isProviderUnavailableError recognizes 429, RESOURCE_EXHAUSTED, and timeout errors", () => {
  assert.equal(isProviderUnavailableError({ status: 429 }), true);
  assert.equal(isProviderUnavailableError({ code: "RESOURCE_EXHAUSTED" }), true);
  assert.equal(isProviderUnavailableError({ code: 429 }), true);
  assert.equal(isProviderUnavailableError({ name: "AbortError" }), true);
  assert.equal(isProviderUnavailableError({ name: "TimeoutError" }), true);
  assert.equal(isProviderUnavailableError(new Error("Resource has been exhausted (e.g. check quota).")), true);
  assert.equal(isProviderUnavailableError(new Error("Rate limit exceeded")), true);
  assert.equal(isProviderUnavailableError(new Error("Request timed out")), true);
  assert.equal(isProviderUnavailableError({ status: 400 }), false);
  assert.equal(isProviderUnavailableError(new Error("Invalid JSON")), false);
});

test("Gemini provider maps 429 RESOURCE_EXHAUSTED to a bounded 503 error", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let attempts = 0;
  const provider = new GeminiProvider(() => ({
    models: {
      generateContent: async () => {
        attempts += 1;
        const error = new Error("RESOURCE_EXHAUSTED: Quota exceeded");
        Object.assign(error, { status: 429, code: "RESOURCE_EXHAUSTED" });
        throw error;
      },
    },
  }));
  await assert.rejects(
    () => provider.complete({ system: "Return JSON.", user: "test", schema: classificationSchema.pick({ rationale: true }) }),
    (error: unknown) => error instanceof AIProviderError && error.status === 503 && error.kind === "unavailable"
  );
  assert.equal(attempts, 2);
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
});

test("feedback reclassification preserves status and applies new classification", () => {
  assert.equal(statusAfterClassification("NEW"), "REVIEWED");
  assert.equal(statusAfterClassification("REVIEWED"), "REVIEWED");
  assert.equal(statusAfterClassification("ACTIONED"), "ACTIONED");

  const validClassification = {
    sentiment: "NEG",
    sentimentScore: -0.7,
    themes: ["Billing"],
    featureArea: "Invoicing",
    rationale: "Customer is complaining about billing delays.",
  };
  const parsed = classificationSchema.safeParse(validClassification);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.sentiment, "NEG");
    assert.equal(parsed.data.featureArea, "Invoicing");
  }
});
