"use client";

import { useEffect, useState } from "react";
import { themeDrilldownPath } from "@/lib/analytics/theme-links";

type Trend = { themeId: string; name: string; color: string; current: number; previous: number; delta: number; percentageChange: number | null; spike: boolean };

export default function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    let active = true;

    const loadTrends = async () => {
      try {
        const response = await fetch(`/api/trends?start=${start.toISOString()}&end=${end.toISOString()}`);
        if (!response.ok) throw new Error("Trends could not be loaded.");
        const payload = (await response.json()) as { data?: Trend[] };
        if (active) {
          setTrends(payload.data ?? []);
          setError("");
        }
      } catch {
        if (active) setError("Trends could not be loaded. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadTrends();
    return () => { active = false; };
  }, []);

  return <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8"><div className="mx-auto max-w-5xl"><header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Workspace / Trends</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Themes in motion.</h1><p className="mt-2 text-sm text-[#718379]">Current 30-day volume compared with the preceding period. A spike means 1.5x prior volume, or at least 3 new items from zero.</p></header>{loading && <p role="status" className="mt-6 rounded-xl bg-white px-4 py-3 text-sm text-[#718379]">Loading trends…</p>}{error && <p role="alert" className="mt-6 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#a44335]">{error}</p>}{!loading && !error && trends.length === 0 && <p role="status" className="mt-6 rounded-xl bg-white px-4 py-3 text-sm text-[#718379]">No theme activity is available for this period.</p>}{!loading && !error && trends.length > 0 && <section className="mt-8 grid gap-4 sm:grid-cols-2">{trends.map((trend) => <article key={trend.themeId} className="rounded-2xl border border-[#dce5de] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">{trend.name}</h2>{trend.spike && <span className="rounded-full bg-[#fff0d2] px-2.5 py-1 text-xs font-semibold text-[#795e19]">Spike</span>}</div><p className="mt-4 text-3xl font-semibold">{trend.current}</p><p className="mt-1 text-xs text-[#789181]">Current 30-day volume · {trend.delta >= 0 ? "+" : ""}{trend.delta} vs previous</p><a href={themeDrilldownPath(trend.themeId)} className="mt-4 inline-block text-xs font-semibold text-[#193c2a] underline underline-offset-4">View feedback for this theme</a></article>)}</section>}<a href="/dashboard" className="mt-6 inline-block text-sm font-semibold text-[#193c2a] underline underline-offset-4">Back to dashboard</a></div></main>;
}
