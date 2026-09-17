"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ReportDetail = { id: string; title: string; periodStart: string; periodEnd: string; contentJson: { executiveSummary: string; topThemes: Array<{ name: string; insight: string }>; sentimentShifts: string[]; notableQuotes: Array<{ quote: string; sourceId: string }>; recommendedActions: string[]; supportingEvidence: string[] } };

export default function ReportPage({ params }: { params: { id: string } }) {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void fetch(`/api/reports/${encodeURIComponent(params.id)}`).then(async (response) => {
      const body = await response.json().catch(() => null) as { data?: ReportDetail; error?: string } | null;
      if (response.status === 404) setNotFound(true);
      else if (!response.ok) setError(body?.error ?? "Report could not be loaded.");
      else setReport(body?.data ?? null);
      setLoading(false);
    }).catch(() => { setError("We could not reach the report. Try again."); setLoading(false); });
  }, [params.id]);

  async function exportPdf() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(params.id)}/pdf`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "The report could not be exported.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `voice-of-customer-report-${params.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "The report could not be exported. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8"><div className="mx-auto max-w-5xl"><div className="flex flex-wrap items-center justify-between gap-4"><Link href="/reports" className="text-sm font-semibold text-[#193c2a] underline underline-offset-4">← Back to Reports</Link>{report && !loading && <button type="button" onClick={() => void exportPdf()} disabled={exporting} className="rounded-xl bg-[#193c2a] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{exporting ? "Exporting..." : "Export PDF"}</button>}</div>{loading && <p role="status" className="mt-8 rounded-2xl border border-dashed border-[#cbdace] bg-white p-12 text-center text-sm text-[#718379]">Loading saved report...</p>}{notFound && !loading && <p role="alert" className="mt-8 rounded-2xl border border-[#dce5de] bg-white p-12 text-center text-sm text-[#718379]">Report not found.</p>}{error && !loading && <p role="alert" className="mt-8 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#a44335]">{error}</p>}{report && !loading && <article className="mt-8 rounded-2xl border border-[#dce5de] bg-white p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Saved Voice of Customer report</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{report.title}</h1><h2 className="mt-8 font-semibold">Executive summary</h2><p className="mt-2 text-sm leading-6 text-[#53685a]">{report.contentJson.executiveSummary}</p><h2 className="mt-8 font-semibold">Top themes</h2><ul className="mt-2 space-y-2 text-sm text-[#53685a]">{report.contentJson.topThemes.map((theme) => <li key={theme.name}><strong>{theme.name}:</strong> {theme.insight}</li>)}</ul><h2 className="mt-8 font-semibold">Sentiment shifts</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#53685a]">{report.contentJson.sentimentShifts.map((shift) => <li key={shift}>{shift}</li>)}</ul><h2 className="mt-8 font-semibold">Notable quotes</h2><ul className="mt-2 space-y-2 text-sm text-[#53685a]">{report.contentJson.notableQuotes.map((item) => <li key={item.sourceId}>“{item.quote}”</li>)}</ul><h2 className="mt-8 font-semibold">Recommended actions</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#53685a]">{report.contentJson.recommendedActions.map((action) => <li key={action}>{action}</li>)}</ul><h2 className="mt-8 font-semibold">Supporting evidence</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#53685a]">{report.contentJson.supportingEvidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></article>}</div></main>;
}
