import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth/guards";
import { createFeedback, listFeedback } from "@/lib/feedback/service";
import { feedbackCreateSchema, feedbackQuerySchema } from "@/lib/validation/feedback";
import { processFeedback } from "@/lib/ai/classifier";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const parsed = feedbackQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Invalid feedback filters." }, { status: 400 });
    return NextResponse.json(await listFeedback(session.user.workspaceId, parsed.data));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(["ADMIN", "ANALYST"]);
    const parsed = feedbackCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid feedback details." }, { status: 400 });
    const feedback = await createFeedback(session.user.workspaceId, parsed.data);
    const processed = await processFeedback(feedback.id, session.user.workspaceId);
    return NextResponse.json({ data: processed ?? feedback }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
