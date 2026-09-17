import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { processFeedback } from "@/lib/ai/classifier";

type Context = { params: { id: string } };

export async function POST(_request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN", "ANALYST"]);
    const feedback = await processFeedback(params.id, session.user.workspaceId);
    if (!feedback) return NextResponse.json({ error: "Classification failed or feedback was not found." }, { status: 422 });
    return NextResponse.json({ data: feedback });
  } catch (error) {
    return authErrorResponse(error);
  }
}
