import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth/guards";
import { calculateThemeTrends } from "@/lib/analytics/trends";
import { dateRangeSchema } from "@/lib/validation/ai";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const params = new URL(request.url).searchParams;
    const parsed = dateRangeSchema.safeParse({ start: params.get("start"), end: params.get("end") });
    if (!parsed.success) return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
    return NextResponse.json({ data: await calculateThemeTrends(session.user.workspaceId, parsed.data.start, parsed.data.end) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
