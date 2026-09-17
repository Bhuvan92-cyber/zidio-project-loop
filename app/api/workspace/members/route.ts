import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireRole(["ADMIN"]);
    const members = await db.user.findMany({ where: { workspaceId: session.user.workspaceId }, select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ data: members });
  } catch (error) {
    return authErrorResponse(error);
  }
}
