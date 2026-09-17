import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { AIProviderError, isProviderUnavailableError } from "@/lib/ai/errors";

const embeddingResponseSchema = z.object({ embeddings: z.array(z.object({ values: z.array(z.number()).min(1) })).min(1) });

export async function createEmbedding(text: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini embedding provider is not configured.");

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.embedContent({
      model: "gemini-embedding-001",
      contents: text,
    });
    const parsed = embeddingResponseSchema.safeParse(response);
    if (!parsed.success) throw new AIProviderError("The AI provider returned invalid embedding data.", 502, "invalid-response");
    return parsed.data.embeddings[0].values;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    console.error("Gemini embedding failed", isProviderUnavailableError(error) ? "unavailable" : "request-failed");
    if (isProviderUnavailableError(error)) throw new AIProviderError("The AI provider is temporarily unavailable.", 503, "unavailable");
    throw new AIProviderError("The AI provider request failed.", 502, "request-failed");
  }
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)) : 0;
}
