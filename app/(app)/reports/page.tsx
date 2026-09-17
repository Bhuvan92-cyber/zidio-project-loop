"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { reportPath } from "@/lib/ai/report-links";

type Report = { id: string; title: string; periodStart: string; periodEnd: string; createdAt: string };
type ReportDetail = Report & { contentJson: { executiveSummary: string; topThemes: Array<{ name: string; insight: string }>; sentimentShifts: string[]; notableQuotes: Array<{ quote: string; sourceId: string }>; recommendedActions: string[]; supportingEvidence: string[] } };

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(true);

  useEffect(() => { void loadReports(); }, []);

  async function loadReports() {
    setReportsLoading(true);
    try {
      const response = await fetch("/api/reports");
      if (!response.ok) throw new Error("Reports could not be loaded.");
      setReports((await response.json()).data ?? []);
    } catch {
      setError("Reports could not be loaded. Please try again.");
    } finally {
      setReportsLoading(false);
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodStart: data.periodStart, periodEnd: data.periodEnd }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) setError(body?.error ?? "Report generation failed.");
      else { await loadReports(); setSelected(body.data); }
    } catch {
      setError("Report generation failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function openReport(id: string) {
    try {
      const response = await fetch(`/api/reports/${id}`);
      if (!response.ok) throw new Error("Report could not be opened.");
      setSelected((await response.json()).data);
    } catch {
      setError("Report could not be opened. Please try again.");
    }
  }

  return <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8"><div className="mx-auto max-w-5xl"><header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Workspace / Reports</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Voice of Customer.</h1><p className="mt-2 text-sm text-[#718379]">Computed workspace statistics become a report narrative with supporting evidence.</p></header><form onSubmit={generate} className="mt-8 flex flex-wrap items-end gap-3 rounded-2xl border border-[#dce5de] bg-white p-5"><label className="text-xs font-semibold text-[#53685a]">Start date<input name="periodStart" type="date" required className="mt-2 block rounded-lg border border-[#d6e1d9] px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-[#53685a]">End date<input name="periodEnd" type="date" required className="mt-2 block rounded-lg border border-[#d6e1d9] px-3 py-2 text-sm" /></label><button type="submit" disabled={pending} className="rounded-xl bg-[#193c2a] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Generating..." : "Generate report"}</button></form>{error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#a44335]">{error}</p>}<div className="mt-6 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]"><section className="rounded-2xl border border-[#dce5de] bg-white p-5"><h2 className="font-semibold">Saved reports</h2>{reportsLoading && <p role="status" className="mt-4 text-sm text-[#718379]">Loading saved reports…</p>} {!reportsLoading && <div className="mt-4 space-y-2">{reports.map((report) => <div key={report.id} className="rounded-xl bg-[#f5f8f5] p-3"><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => void openReport(report.id)} className="text-left text-sm hover:text-[#193c2a]"><span className="font-medium">{report.title}</span><span className="mt-1 block text-xs text-[#8a9a90]">{new Date(report.createdAt).toLocaleDateString()}</span></button><Link href={reportPath(report.id)} className="shrink-0 text-xs font-semibold text-[#193c2a] underline underline-offset-4">Open page</Link></div></div>)}{reports.length === 0 && <p className="text-sm text-[#718379]">No saved reports yet.</p>}</div>}</section>{selected && <article className="rounded-2xl border border-[#dce5de] bg-white p-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Report detail</p><h2 className="mt-2 text-2xl font-semibold">{selected.title}</h2><h3 className="mt-6 font-semibold">Executive summary</h3><p className="mt-2 text-sm leading-6 text-[#53685a]">{selected.contentJson.executiveSummary}</p><h3 className="mt-6 font-semibold">Top themes</h3><ul className="mt-2 space-y-2 text-sm text-[#53685a]">{selected.contentJson.topThemes.map((theme) => <li key={theme.name}><strong>{theme.name}:</strong> {theme.insight}</li>)}</ul><h3 className="mt-6 font-semibold">Recommended actions</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#53685a]">{selected.contentJson.recommendedActions.map((action) => <li key={action}>{action}</li>)}</ul></article>}</div><a href="/dashboard" className="mt-6 inline-block text-sm font-semibold text-[#193c2a] underline underline-offset-4">Back to dashboard</a></div></main>;
}
