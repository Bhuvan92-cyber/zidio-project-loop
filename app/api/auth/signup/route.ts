import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signupSchema } from "@/lib/validation/auth";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createWorkspaceAdmin } from "@/lib/auth/signup";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : null;
  // Also accept the request's own host as a valid origin (handles multiple Vercel alias URLs for the same deployment).
  const serverHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const serverOrigin = serverHost ? `https://${serverHost}` : null;
  const isValidOrigin = !origin || !expectedOrigin || origin === expectedOrigin || (!!serverOrigin && origin === serverOrigin);
  if (!isValidOrigin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!consumeRateLimit(`signup:${clientKey}`, 5, 60_000)) return NextResponse.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid signup details." }, { status: 400 });

  const { name, email, password, workspaceName } = parsed.data;
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    await bcrypt.hash("signup-timing-placeholder", 12);
    return NextResponse.json({ message: "If the account is eligible, workspace setup can continue." }, { status: 202 });
  }

  const user = await createWorkspaceAdmin({ name, email, password, workspaceName });

  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspaceId };
  return NextResponse.json({ user: safeUser }, { status: 201 });
}
