import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth/guards";
import { getReport } from "@/lib/ai/reports";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function GET(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const report = await getReport(session.user.workspaceId, params.id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    return NextResponse.json({ data: report });
  } catch (error) {
    return authErrorResponse(error);
  }
}
