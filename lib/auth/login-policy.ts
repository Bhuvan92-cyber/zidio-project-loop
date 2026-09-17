import { consumeRateLimit, isRateLimited, resetRateLimit } from "@/lib/security/rate-limit";

export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 60_000;

function loginRateLimitKey(email: string) {
  return `login:${email}`;
}

export function isLoginRateLimited(email: string) {
  return isRateLimited(loginRateLimitKey(email), LOGIN_LIMIT);
}

export function recordFailedLogin(email: string) {
  consumeRateLimit(loginRateLimitKey(email), LOGIN_LIMIT, LOGIN_WINDOW_MS);
}

export function clearLoginFailures(email: string) {
  resetRateLimit(loginRateLimitKey(email));
}
