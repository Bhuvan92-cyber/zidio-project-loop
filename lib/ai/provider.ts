import { toJSONSchema, type ZodType } from "zod";
import { GoogleGenAI } from "@google/genai";
import { AIProviderError, isProviderUnavailableError } from "@/lib/ai/errors";

export interface AIProvider {
  complete<T>(input: { system: string; user: string; schema: ZodType<T> }): Promise<T>;
}

type GeminiClient = { models: { generateContent: (input: { model: string; contents: string; config: { systemInstruction: string; temperature: number; maxOutputTokens: number; responseMimeType: string; responseJsonSchema: unknown } }) => Promise<{ text?: string }> } };
type GeminiClientFactory = (apiKey: string) => GeminiClient;
class InvalidStructuredOutputError extends Error {}

function providerFailureDetails(error: unknown) {
  if (!error || typeof error !== "object") return { status: undefined, code: undefined, message: "Unknown provider error." };
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "Unknown provider error.";
  return {
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    code: typeof candidate.code === "string" || typeof candidate.code === "number" ? candidate.code : undefined,
    message: message.replace(/([?&\s](?:key|api[_-]?key|token|authorization)[=:\s])[^\s&]+/gi, "$1<redacted>"),
  };
}

export function parseModelJson(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(cleaned);
}

export class GeminiProvider implements AIProvider {
  constructor(private readonly createClient: GeminiClientFactory = (apiKey) => new GoogleGenAI({ apiKey })) {}

  async complete<T>({ system, user, schema }: { system: string; user: string; schema: ZodType<T> }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("AI provider is not configured.");
    const client = this.createClient(apiKey);
    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    let lastFailureKind: "unavailable" | "invalid-response" | "request-failed" = "request-failed";
    let lastFailure: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: user,
          config: {
            systemInstruction: system,
            temperature: 0,
            maxOutputTokens: 4000,
            responseMimeType: "application/json",
            responseJsonSchema: toJSONSchema(schema, { target: "draft-07" }),
          },
        });
        const text = response.text;
        if (!text) throw new InvalidStructuredOutputError("AI provider returned no text.");
        let modelValue: unknown;
        try {
          modelValue = parseModelJson(text);
        } catch {
          throw new InvalidStructuredOutputError("AI provider returned malformed JSON.");
        }
        const parsed = schema.safeParse(modelValue);
        if (!parsed.success) {
          // Safe diagnostic logging: logs schema paths and codes only, no user data, no API keys
          const issues = parsed.error.issues.map((i) => ({ path: i.path, code: i.code, message: i.message }));
          console.error("[AI diag] Zod validation failed", { model, issues, rawKeys: typeof modelValue === "object" && modelValue !== null ? Object.keys(modelValue as object) : typeof modelValue, rawPreview: typeof text === "string" ? text.substring(0, 300).replace(/("(?:content|quote|text|answer|rationale|insight|executiveSummary)":\s*")[^"]{20,}/g, '$1[...]') : "no-text" });
          throw new InvalidStructuredOutputError("AI provider returned invalid structured data.");
        }
        return parsed.data;
      } catch (error) {
        lastFailure = error;
        lastFailureKind = error instanceof InvalidStructuredOutputError ? "invalid-response" : isProviderUnavailableError(error) ? "unavailable" : "request-failed";
        if (attempt === 0) continue;
      }
    }
    const details = providerFailureDetails(lastFailure);
    console.error("AI completion failed", { provider: "gemini", model, kind: lastFailureKind, ...details });
    if (lastFailureKind === "unavailable") throw new AIProviderError("The AI provider is temporarily unavailable.", 503, lastFailureKind);
    if (lastFailureKind === "invalid-response") throw new AIProviderError("The AI provider returned invalid structured data.", 502, lastFailureKind);
    throw new AIProviderError("The AI provider request failed.", 502, lastFailureKind);
  }
}

export const aiProvider: AIProvider = new GeminiProvider();
