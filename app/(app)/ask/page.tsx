"use client";

import { FormEvent, useState } from "react";

type Source = { id: string; content: string; customerLabel: string | null; channel: string; score: number };
type Answer = { answer: string; sourceIds: string[]; insufficientEvidence: boolean };

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function ask(event: FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) setError(body?.error ?? "Ask LOOP is unavailable."); else { setAnswer(body.answer); setSources(body.sources); }
    } catch {
      setError("Ask LOOP is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8"><div className="mx-auto max-w-4xl"><header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Workspace / Ask LOOP</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Ask the customer voice.</h1><p className="mt-2 text-sm text-[#718379]">Answers are grounded in feedback from this workspace and show their source records.</p></header><form onSubmit={ask} className="mt-8 flex gap-3"><label htmlFor="question" className="sr-only">Question</label><input id="question" required maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What are customers saying about onboarding?" className="min-w-0 flex-1 rounded-xl border border-[#d6e1d9] bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-[#b8d95f]" /><button type="submit" disabled={pending} className="rounded-xl bg-[#193c2a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Thinking..." : "Ask LOOP"}</button></form>{error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#a44335]">{error}</p>}{answer && <section className="mt-6 rounded-2xl border border-[#dce5de] bg-white p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#789181]">Grounded answer</p><p className="mt-4 whitespace-pre-wrap text-lg leading-8 text-[#34483b]">{answer.answer}</p>{answer.insufficientEvidence && <p className="mt-5 rounded-xl bg-[#fff7df] px-4 py-3 text-sm text-[#795e19]">The retrieved feedback did not provide enough evidence for a supported conclusion.</p>}<h2 className="mt-8 text-sm font-semibold">Source feedback</h2><div className="mt-3 space-y-3">{sources.length === 0 && <p className="text-sm text-[#718379]">No supporting feedback was found.</p>}{sources.map((source) => <article key={source.id} className="rounded-xl border border-[#edf2ee] bg-[#f8faf8] p-4"><p className="text-sm leading-6 text-[#4d6254]">{source.content}</p><p className="mt-2 text-xs text-[#8a9a90]">{source.customerLabel ?? "Unknown customer"} · {source.channel.replaceAll("_", " ")} · relevance {source.score.toFixed(2)}</p></article>)}</div></section>}<a href="/dashboard" className="mt-6 inline-block text-sm font-semibold text-[#193c2a] underline underline-offset-4">Back to dashboard</a></div></main>;
}
