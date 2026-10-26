import crypto from "node:crypto";

export function generateInvitationToken(): { rawToken: string; tokenDigest: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenDigest = hashInvitationToken(rawToken);
  return { rawToken, tokenDigest };
}

export function hashInvitationToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
