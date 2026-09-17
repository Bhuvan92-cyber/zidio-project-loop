import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth/guards";
import { deleteFeedback, getFeedback, InvalidFeedbackTransitionError, updateFeedback } from "@/lib/feedback/service";
import { feedbackUpdateSchema } from "@/lib/validation/feedback";

type Context = { params: { id: string } };

export async function GET(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const feedback = await getFeedback(session.user.workspaceId, params.id);
    if (!feedback) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
    return NextResponse.json({ data: feedback });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN", "ANALYST"]);
    const parsed = feedbackUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid feedback update." }, { status: 400 });
    const feedback = await updateFeedback(session.user.workspaceId, params.id, parsed.data);
    if (!feedback) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
    return NextResponse.json({ data: feedback });
  } catch (error) {
    if (error instanceof InvalidFeedbackTransitionError) return NextResponse.json({ error: error.message }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN"]);
    const deleted = await deleteFeedback(session.user.workspaceId, params.id);
    if (!deleted) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
