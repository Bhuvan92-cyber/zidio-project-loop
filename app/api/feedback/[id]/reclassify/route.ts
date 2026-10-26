import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { processFeedback } from "@/lib/ai/classifier";
import { getFeedback } from "@/lib/feedback/service";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function POST(_request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN", "ANALYST"]);
    const existing = await getFeedback(session.user.workspaceId, params.id);
    if (!existing) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
    const feedback = await processFeedback(params.id, session.user.workspaceId);
    if (!feedback) return NextResponse.json({ error: "Classification failed." }, { status: 422 });
    return NextResponse.json({ data: feedback });
  } catch (error) {
    return authErrorResponse(error);
  }
}
