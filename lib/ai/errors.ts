export type AIProviderFailureKind = "unavailable" | "invalid-response" | "request-failed";

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly status: 502 | 503,
    public readonly kind: AIProviderFailureKind,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export function isProviderUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const code = typeof candidate.code === "string" || typeof candidate.code === "number" ? String(candidate.code) : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";

  return (
    candidate.status === 503 ||
    candidate.status === 429 ||
    code === "503" ||
    code === "429" ||
    code === "UNAVAILABLE" ||
    code === "RESOURCE_EXHAUSTED" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    /\b(?:503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|temporarily unavailable|quota|rate\s*limit|timed?\s*out|abort/i.test(message)
  );
}
