import type { ZodType } from "zod";
import { GoogleGenAI } from "@google/genai";
import { AIProviderError, isProviderUnavailableError } from "@/lib/ai/errors";

export interface AIProvider {
  complete<T>(input: { system: string; user: string; schema: ZodType<T> }): Promise<T>;
}

type GeminiClient = { models: { generateContent: (input: { model: string; contents: string; config: { systemInstruction: string; temperature: number; maxOutputTokens: number; responseMimeType: string } }) => Promise<{ text?: string }> } };
type GeminiClientFactory = (apiKey: string) => GeminiClient;
class InvalidStructuredOutputError extends Error {}

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
    let lastFailureKind: "unavailable" | "invalid-response" | "request-failed" = "request-failed";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await client.models.generateContent({
          model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
          contents: user,
          config: {
            systemInstruction: system,
            temperature: 0,
            maxOutputTokens: 4000,
            responseMimeType: "application/json",
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
        if (!parsed.success) throw new InvalidStructuredOutputError("AI provider returned invalid structured data.");
        return parsed.data;
      } catch (error) {
        lastFailureKind = error instanceof InvalidStructuredOutputError ? "invalid-response" : isProviderUnavailableError(error) ? "unavailable" : "request-failed";
        if (attempt === 0) continue;
      }
    }
    console.error("AI completion failed", lastFailureKind);
    if (lastFailureKind === "unavailable") throw new AIProviderError("The AI provider is temporarily unavailable.", 503, lastFailureKind);
    if (lastFailureKind === "invalid-response") throw new AIProviderError("The AI provider returned invalid structured data.", 502, lastFailureKind);
    throw new AIProviderError("The AI provider request failed.", 502, lastFailureKind);
  }
}

export const aiProvider: AIProvider = new GeminiProvider();
