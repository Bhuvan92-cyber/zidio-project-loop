import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth/guards";
import { answerQuestion } from "@/lib/ai/qa";
import { askSchema } from "@/lib/validation/ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const parsed = askSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid question." }, { status: 400 });
    return NextResponse.json(await answerQuestion(session.user.workspaceId, parsed.data.question));
  } catch (error) {
    return authErrorResponse(error);
  }
}
