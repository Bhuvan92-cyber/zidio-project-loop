import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function GET(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const rows = await db.feedbackTheme.findMany({ where: { themeId: params.id, workspaceId: session.user.workspaceId, theme: { workspaceId: session.user.workspaceId }, feedback: { workspaceId: session.user.workspaceId } }, select: { confidence: true, feedback: { select: { id: true, content: true, sentiment: true, status: true, createdAt: true } } }, orderBy: { confidence: "desc" } });
    return NextResponse.json({ data: rows });
  } catch (error) {
    return authErrorResponse(error);
  }
}
