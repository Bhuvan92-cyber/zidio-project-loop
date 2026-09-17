"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { simulatedSupportTickets } from "@/lib/feedback/simulated";

type Feedback = { id: string; content: string; channel: string; customerLabel: string | null; status: string; createdAt: string; sentiment: string | null };
type FeedbackResponse = { data: Feedback[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type ImportResult = { importedCount: number; errorCount: number; processing?: { processedCount: number; failedProcessingCount: number }; errors?: Array<{ row: number; message: string }> };
type Theme = { id: string; name: string };
type FilterState = { search: string; channel: string; sentiment: string; status: string; themeId: string; startDate: string; endDate: string; sort: "createdAt" | "updatedAt"; direction: "asc" | "desc" };

const defaultFilters: FilterState = { search: "", channel: "", sentiment: "", status: "", themeId: "", startDate: "", endDate: "", sort: "createdAt", direction: "desc" };

export default function InboxPage() {
  const [result, setResult] = useState<FeedbackResponse | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [importPending, setImportPending] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [entryPending, setEntryPending] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [entrySuccess, setEntrySuccess] = useState("");
  const [simulationPending, setSimulationPending] = useState(false);
  const [simulationError, setSimulationError] = useState("");
  const [simulationSuccess, setSimulationSuccess] = useState("");
  const [pendingStatusIds, setPendingStatusIds] = useState<Set<string>>(new Set());
  const [pendingReclassifyIds, setPendingReclassifyIds] = useState<Set<string>>(new Set());

  const loadFeedback = useCallback(async (nextPage: number, activeFilters: FilterState) => {
    setError("");
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "20", sort: activeFilters.sort, direction: activeFilters.direction });
    if (activeFilters.search.trim()) params.set("search", activeFilters.search.trim());
    if (activeFilters.channel) params.set("channel", activeFilters.channel);
    if (activeFilters.sentiment) params.set("sentiment", activeFilters.sentiment);
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.themeId) params.set("themeId", activeFilters.themeId);
    if (activeFilters.startDate) params.set("startDate", activeFilters.startDate);
    if (activeFilters.endDate) params.set("endDate", activeFilters.endDate);
    try {
      const response = await fetch(`/api/feedback?${params}`);
      if (!response.ok) { setError("We could not load the inbox."); return; }
      setResult(await response.json());
    } catch {
      setError("We could not reach the inbox. Try again.");
    }
  }, []);

  useEffect(() => {
    const themeId = new URLSearchParams(window.location.search).get("themeId") ?? "";
    const nextFilters = { ...defaultFilters, themeId };
    setFilters(nextFilters);
    setPage(1);
    void loadFeedback(1, nextFilters);
    void fetch("/api/themes").then(async (response) => { if (response.ok) setThemes((await response.json()).data); });
  }, [loadFeedback]);

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    setPage(1);
    void loadFeedback(1, nextFilters);
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    await loadFeedback(1, filters);
  }

  function clearFilters() {
    setFilters(defaultFilters);
    setPage(1);
    void loadFeedback(1, defaultFilters);
  }

  async function updateStatus(id: string, status: string) {
    if (pendingStatusIds.has(id)) return;
    setPendingStatusIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) { setError("Status could not be updated."); return; }
      await loadFeedback(page, filters);
    } catch {
      setError("Status could not be updated. Try again.");
    } finally {
      setPendingStatusIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  async function reclassify(id: string) {
    if (pendingReclassifyIds.has(id)) return;
    setPendingReclassifyIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/feedback/${id}/reclassify`, { method: "POST" });
      if (!response.ok) { setError("Feedback could not be reclassified."); return; }
      await loadFeedback(page, filters);
    } catch {
      setError("Feedback could not be reclassified. Try again.");
    } finally {
      setPendingReclassifyIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) { setError("Choose a CSV file first."); return; }
    setImportPending(true); setError(""); setImportResult(null);
    const body = new FormData(); body.append("file", file);
    try {
      const response = await fetch("/api/feedback/import", { method: "POST", body });
      const responseBody = await response.json().catch(() => null) as (ImportResult & { error?: string }) | null;
      if (!response.ok) { setError(responseBody?.error ?? "CSV import failed."); setImportResult(responseBody?.errors ? { importedCount: 0, errorCount: responseBody.errors.length, errors: responseBody.errors } : null); }
      else { setImportResult(responseBody); form.reset(); await loadFeedback(1, filters); }
    } catch {
      setError("CSV import failed. Please try again.");
    } finally {
      setImportPending(false);
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entryPending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const content = String(formData.get("content") ?? "").trim();
    const channel = String(formData.get("channel") ?? "");
    const customerLabel = String(formData.get("customerLabel") ?? "").trim();

    setEntryError("");
    setEntrySuccess("");
    if (!content) { setEntryError("Enter feedback content."); return; }
    if (content.length > 10_000) { setEntryError("Feedback must be 10,000 characters or fewer."); return; }
    if (!channel) { setEntryError("Select a channel."); return; }

    setEntryPending(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, channel, ...(customerLabel ? { customerLabel } : {}) }),
      });
      const responseBody = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        const fallback = response.status === 400 ? "Check the feedback details." : response.status === 401 ? "You must be signed in to add feedback." : response.status === 403 ? "You do not have permission to add feedback." : response.status === 500 ? "Feedback could not be saved right now." : "Feedback could not be saved.";
        setEntryError(responseBody?.error ?? fallback);
        return;
      }
      form.reset();
      setEntrySuccess("Feedback added successfully.");
      await loadFeedback(page, filters);
    } catch {
      setEntryError("We could not reach the server. Try again.");
    } finally {
      setEntryPending(false);
    }
  }

  async function simulateSupportTickets() {
    if (simulationPending) return;
    setSimulationPending(true);
    setSimulationError("");
    setSimulationSuccess("");
    let createdCount = 0;
    let failedCount = 0;

    try {
      for (const fixture of simulatedSupportTickets) {
        try {
          const response = await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fixture),
          });
          if (response.ok && response.status === 201) createdCount += 1;
          else failedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (createdCount > 0) await loadFeedback(page, filters);
      if (failedCount === 0) setSimulationSuccess(`Created ${createdCount} simulated support ticket${createdCount === 1 ? "" : "s"}.`);
      else if (createdCount > 0) setSimulationError(`Created ${createdCount} simulated support ticket${createdCount === 1 ? "" : "s"}; ${failedCount} failed.`);
      else setSimulationError("No simulated support tickets were created. Check your access and try again.");
    } finally {
      setSimulationPending(false);
    }
  }

  const hasFilters = Object.entries(filters).some(([key, value]) => key === "sort" ? value !== "createdAt" : key === "direction" ? value !== "desc" : Boolean(value));

  return (
    <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8"><div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Workspace / Inbox</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Feedback inbox</h1><p className="mt-2 text-sm text-[#718379]">Review customer signals and move them through the action workflow.</p></div><a href="/" className="text-sm font-semibold text-[#193c2a] underline underline-offset-4">Back to dashboard</a></header>
      <form onSubmit={submitSearch} className="mt-8 flex max-w-xl gap-3"><label className="sr-only" htmlFor="feedback-search">Search feedback</label><input id="feedback-search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search feedback..." className="min-w-0 flex-1 rounded-xl border border-[#d6e1d9] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#b8d95f]" /><button className="rounded-xl bg-[#193c2a] px-5 py-3 text-sm font-semibold text-white">Search</button></form>
      <div className="mt-4 grid gap-3 rounded-2xl border border-[#dce5de] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-semibold text-[#53685a]">Channel<select value={filters.channel} onChange={(event) => updateFilter("channel", event.target.value)} className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm"><option value="">All channels</option><option value="SUPPORT_TICKET">Support ticket</option><option value="APP_STORE">App store</option><option value="NPS_SURVEY">NPS survey</option><option value="SALES_CALL">Sales call</option><option value="COMMUNITY">Community</option></select></label><label className="text-xs font-semibold text-[#53685a]">Sentiment<select value={filters.sentiment} onChange={(event) => updateFilter("sentiment", event.target.value)} className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm"><option value="">All sentiment</option><option value="POS">Positive</option><option value="NEU">Neutral</option><option value="NEG">Negative</option></select></label><label className="text-xs font-semibold text-[#53685a]">Status<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm"><option value="">All status</option><option value="NEW">New</option><option value="REVIEWED">Reviewed</option><option value="ACTIONED">Actioned</option></select></label><label className="text-xs font-semibold text-[#53685a]">Theme<select value={filters.themeId} onChange={(event) => updateFilter("themeId", event.target.value)} className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm"><option value="">All themes</option>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label><label className="text-xs font-semibold text-[#53685a]">Start date<input type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm" /></label><label className="text-xs font-semibold text-[#53685a]">End date<input type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm" /></label><label className="text-xs font-semibold text-[#53685a]">Sort by<select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value as FilterState["sort"])} className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm"><option value="createdAt">Created date</option><option value="updatedAt">Updated date</option></select></label><label className="text-xs font-semibold text-[#53685a]">Direction<select value={filters.direction} onChange={(event) => updateFilter("direction", event.target.value as FilterState["direction"])} className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm"><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label><button type="button" disabled={!hasFilters} onClick={clearFilters} className="rounded-lg border border-[#d6e1d9] px-3 py-2 text-sm font-semibold text-[#53685a] disabled:opacity-40">Clear filters</button></div>
      <form onSubmit={submitFeedback} className="mt-4 rounded-2xl border border-[#dce5de] bg-white p-4"><div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto] lg:items-end"><label className="text-xs font-semibold text-[#53685a]">Feedback content<textarea name="content" required maxLength={10_000} rows={3} placeholder="What did the customer say?" className="mt-2 w-full resize-y rounded-lg border border-[#d6e1d9] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b8d95f]" /></label><label className="text-xs font-semibold text-[#53685a]">Channel<select name="channel" required defaultValue="" className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-sm"><option value="" disabled>Select a channel</option><option value="SUPPORT_TICKET">Support ticket</option><option value="APP_STORE">App store</option><option value="NPS_SURVEY">NPS survey</option><option value="SALES_CALL">Sales call</option><option value="COMMUNITY">Community</option></select></label><label className="text-xs font-semibold text-[#53685a]">Customer label<span className="ml-1 font-normal text-[#8a9a90]">(optional)</span><input name="customerLabel" maxLength={160} placeholder="e.g. Acme Co" className="mt-2 w-full rounded-lg border border-[#d6e1d9] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b8d95f]" /></label><button type="submit" disabled={entryPending} className="rounded-xl bg-[#193c2a] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{entryPending ? "Adding..." : "Add feedback"}</button></div>{entryError && <p role="alert" className="mt-3 text-sm text-[#a44335]">{entryError}</p>}{entrySuccess && <p role="status" className="mt-3 text-sm text-[#53725e]">{entrySuccess}</p>}</form>
      <section className="mt-4 rounded-2xl border border-[#dce5de] bg-[#eef4ef] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#34483b]">Simulated support channel</h2><p className="mt-1 text-xs text-[#718379]">Load realistic support tickets through the normal feedback pipeline.</p></div><button type="button" onClick={() => void simulateSupportTickets()} disabled={simulationPending} className="rounded-xl border border-[#193c2a] px-4 py-2.5 text-sm font-semibold text-[#193c2a] disabled:opacity-50">{simulationPending ? "Loading tickets..." : "Simulate support tickets"}</button></div>{simulationError && <p role="alert" className="mt-3 text-sm text-[#a44335]">{simulationError}</p>}{simulationSuccess && <p role="status" className="mt-3 text-sm text-[#53725e]">{simulationSuccess}</p>}</section>
      <form onSubmit={importCsv} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-[#cbdace] bg-[#f8faf8] p-4"><label className="text-xs font-semibold text-[#53685a]" htmlFor="csv-file">Import CSV<input id="csv-file" name="file" type="file" accept=".csv,text/csv" className="mt-2 block max-w-full text-sm" /></label><button disabled={importPending} className="rounded-xl border border-[#193c2a] px-4 py-2.5 text-sm font-semibold text-[#193c2a] disabled:opacity-50">{importPending ? "Importing..." : "Import feedback"}</button><p className="w-full text-xs text-[#789181]">Required columns: content, channel, created_at. Optional: customer_label. Validation completes before records are created.</p></form>
      {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#a44335]">{error}</p>}{importResult && <div role="status" className="mt-5 rounded-xl bg-[#e8f1e5] px-4 py-3 text-sm text-[#53685a]"><p>Imported {importResult.importedCount} row(s); {importResult.errorCount} validation error(s).</p>{importResult.processing && <p className="mt-1">Processed {importResult.processing.processedCount}; {importResult.processing.failedProcessingCount} marked for retry.</p>}{importResult.errors && <ul className="mt-2 list-disc pl-5">{importResult.errors.map((item) => <li key={`${item.row}-${item.message}`}>Row {item.row}: {item.message}</li>)}</ul>}</div>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce5de] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#eef4ef] text-xs uppercase tracking-[0.12em] text-[#789181]"><tr><th className="px-5 py-4">Feedback</th><th className="px-5 py-4">Channel</th><th className="px-5 py-4">Sentiment</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Update</th><th className="px-5 py-4">AI</th></tr></thead><tbody className="divide-y divide-[#edf2ee]">{result?.data.map((item) => <tr key={item.id}><td className="max-w-md px-5 py-4"><p className="line-clamp-2 font-medium text-[#34483b]">{item.content}</p><p className="mt-1 text-xs text-[#8a9a90]">{item.customerLabel ?? "Unknown customer"} Â· {new Date(item.createdAt).toLocaleDateString()}</p></td><td className="px-5 py-4 text-xs text-[#718379]">{item.channel.replaceAll("_", " ")}</td><td className="px-5 py-4"><span className="rounded-full bg-[#f1f5f1] px-2.5 py-1 text-xs font-semibold">{item.sentiment ?? "Pending"}</span></td><td className="px-5 py-4 text-xs font-semibold text-[#53725e]">{item.status}</td><td className="px-5 py-4"><select disabled={pendingStatusIds.has(item.id)} aria-label={`Update status for feedback ${item.id}`} value={item.status} onChange={(event) => void updateStatus(item.id, event.target.value)} className="rounded-lg border border-[#d6e1d9] bg-white px-2 py-2 text-xs disabled:opacity-50"><option value="NEW">NEW</option><option value="REVIEWED">REVIEWED</option><option value="ACTIONED">ACTIONED</option></select></td><td className="px-5 py-4"><button type="button" disabled={pendingReclassifyIds.has(item.id)} onClick={() => void reclassify(item.id)} className="rounded-lg border border-[#193c2a] px-3 py-2 text-xs font-semibold text-[#193c2a] disabled:opacity-50">{pendingReclassifyIds.has(item.id) ? "Reclassifying..." : "Reclassify"}</button></td></tr>)}</tbody></table></div>{result && result.data.length === 0 && <p className="px-5 py-12 text-center text-sm text-[#718379]">{hasFilters ? "No feedback matches the current filters." : "No feedback matches these filters."}</p>}{!result && !error && <p className="px-5 py-12 text-center text-sm text-[#718379]">Loading inbox...</p>}<footer className="flex items-center justify-between border-t border-[#edf2ee] px-5 py-4 text-xs text-[#718379]"><span>{result ? `${result.pagination.total} feedback items` : ""}</span><div className="flex gap-2"><button disabled={!result || page <= 1} onClick={() => { const next = page - 1; setPage(next); void loadFeedback(next, filters); }} className="rounded-lg border border-[#d6e1d9] px-3 py-2 disabled:opacity-40">Previous</button><button disabled={!result || page >= (result?.pagination.totalPages ?? 1)} onClick={() => { const next = page + 1; setPage(next); void loadFeedback(next, filters); }} className="rounded-lg border border-[#d6e1d9] px-3 py-2 disabled:opacity-40">Next</button></div></footer></section>
    </div></main>
  );
}
