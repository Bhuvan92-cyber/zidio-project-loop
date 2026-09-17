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

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, workspaceId: true },
  });
  if (!user) throw new AuthError("Authentication required.", 401);
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
  console.error("Unhandled route error", error instanceof Error ? error.name : "unknown error");
  return NextResponse.json({ error: "Unable to complete request." }, { status: 500 });
}
