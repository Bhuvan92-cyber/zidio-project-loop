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
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return candidate.status === 503 || candidate.code === 503 || candidate.code === "UNAVAILABLE" || /\b503\b|UNAVAILABLE|high demand|temporarily unavailable/i.test(message);
}
