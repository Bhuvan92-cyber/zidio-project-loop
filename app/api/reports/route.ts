import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth/guards";
import { generateReport, listReports } from "@/lib/ai/reports";
import { reportRequestSchema } from "@/lib/validation/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json({ data: await listReports(session.user.workspaceId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(["ADMIN", "ANALYST"]);
    const parsed = reportRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid report period." }, { status: 400 });
    const report = await generateReport(session.user.workspaceId, session.user.id, parsed.data.periodStart, parsed.data.periodEnd);
    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
