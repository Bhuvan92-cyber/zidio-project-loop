import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { AIProviderError } from "@/lib/ai/errors";

export async function requireSession() {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch {
    throw new AuthError("Authentication required.", 401);
  }
  if (!session?.user?.id) {
    throw new AuthError("Authentication required.", 401);
  }

  let user;
  try {
    user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, workspaceId: true, membershipStatus: true },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    if (code === "P2022" || /column.*membershipStatus.*does not exist|P2022/i.test(message)) {
      user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true, workspaceId: true },
      });
    } else {
      throw err;
    }
  }

  if (!user || ("membershipStatus" in user && user.membershipStatus !== "ACTIVE")) {
    throw new AuthError("Authentication required.", 401);
  }
  session.user.workspaceId = user.workspaceId;
  session.user.role = user.role;
  return session;
}

export async function requireRole(roles: Role[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) throw new AuthError("You do not have permission for this action.", 403);
  return session;
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AIProviderError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && /P1001|can't reach database server/i.test(error.message)) {
    console.error("Database unavailable");
    return NextResponse.json({ error: "The database is temporarily unavailable." }, { status: 503 });
  }
  if (error instanceof Error && (/P2034|serialization|could not serialize/i.test(error.message) || (error as { code?: string }).code === "P2034")) {
    console.error("Concurrent update conflict detected");
    return NextResponse.json({ error: "Concurrent modification conflict. Please retry." }, { status: 409 });
  }
  console.error("Unhandled route error", error instanceof Error ? error.name : "unknown error");
  return NextResponse.json({ error: "Unable to complete request." }, { status: 500 });
}
