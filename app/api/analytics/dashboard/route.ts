import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth/guards";
import { dashboardQuerySchema, getDashboardData } from "@/lib/analytics/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const params = new URL(request.url).searchParams;
    const parsed = dashboardQuerySchema.safeParse({ start: params.get("start"), end: params.get("end") });
    if (!parsed.success) return NextResponse.json({ error: "Invalid dashboard date range." }, { status: 400 });
    return NextResponse.json({ data: await getDashboardData(session.user.workspaceId, { start: new Date(`${parsed.data.start}T00:00:00.000Z`), end: new Date(`${parsed.data.end}T00:00:00.000Z`) }) });
  } catch (error) { return authErrorResponse(error); }
}
