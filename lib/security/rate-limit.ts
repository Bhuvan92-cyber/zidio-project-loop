type Entry = { count: number; resetAt: number };

const entries = new Map<string, Entry>();

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = entries.get(key);
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function isRateLimited(key: string, limit: number) {
  const current = entries.get(key);
  return Boolean(current && current.resetAt > Date.now() && current.count >= limit);
}

export function resetRateLimit(key: string) {
  entries.delete(key);
}
