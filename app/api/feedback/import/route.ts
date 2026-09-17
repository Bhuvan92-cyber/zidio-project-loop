import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { CSV_MAX_BYTES } from "@/lib/validation/csv";
import { importCsvContent } from "@/lib/feedback/import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["ADMIN", "ANALYST"]);
    const formData = await request.formData().catch(() => null);
    const entry = formData?.get("file");
    if (!(entry instanceof File)) return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
    if (!entry.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ error: "Only .csv files are supported." }, { status: 415 });
    if (entry.size > CSV_MAX_BYTES) return NextResponse.json({ error: `CSV files must be ${CSV_MAX_BYTES / (1024 * 1024)} MB or smaller.` }, { status: 413 });
    const result = await importCsvContent(session.user.workspaceId, await entry.text());
    if (result.errorCount > 0) return NextResponse.json({ error: "CSV validation failed.", ...result }, { status: 422 });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
