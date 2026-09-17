import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth/guards";
import { getReport } from "@/lib/ai/reports";
import { createReportPdf } from "@/lib/reports/pdf";
import { reportNarrativeSchema } from "@/lib/ai/schemas";

export const dynamic = "force-dynamic";
type Context = { params: { id: string } };

export async function GET(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const report = await getReport(session.user.workspaceId, params.id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    const content = reportNarrativeSchema.safeParse(report.contentJson);
    if (!content.success) return NextResponse.json({ error: "This report cannot be exported." }, { status: 500 });
    return new NextResponse(createReportPdf({ ...report, contentJson: content.data }), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="voice-of-customer-report-${report.id}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
