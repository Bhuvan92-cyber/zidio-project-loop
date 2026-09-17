import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const themes = await db.theme.findMany({ where: { workspaceId: session.user.workspaceId }, select: { id: true, name: true, description: true, color: true, _count: { select: { feedback: true } } }, orderBy: { name: "asc" } });
    return NextResponse.json({ data: themes });
  } catch (error) {
    return authErrorResponse(error);
  }
}
