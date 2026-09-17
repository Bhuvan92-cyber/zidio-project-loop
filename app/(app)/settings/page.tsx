"use client";

import { useEffect, useState } from "react";

type Member = { id: string; name: string; email: string; role: "ADMIN" | "ANALYST" | "VIEWER" };

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingMemberIds, setPendingMemberIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetch("/api/workspace/members").then(async (response) => {
      if (!response.ok) { setError(response.status === 403 ? "Only workspace admins can manage members." : "Members could not be loaded."); setLoading(false); return; }
      const body = await response.json(); setMembers(body.data); setLoading(false);
    }).catch(() => { setError("Members could not be loaded. Please try again."); setLoading(false); });
  }, []);

  async function changeRole(id: string, role: Member["role"]) {
    if (pendingMemberIds.has(id)) return;
    setPendingMemberIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/workspace/members/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      if (!response.ok) { const body = await response.json().catch(() => null); setError(body?.error ?? "Role could not be updated."); return; }
      setMembers((current) => current.map((member) => member.id === id ? { ...member, role } : member));
    } catch {
      setError("Role could not be updated. Please try again.");
    } finally {
      setPendingMemberIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  return <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8"><div className="mx-auto max-w-5xl"><header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Workspace / Settings</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Workspace members</h1><p className="mt-2 text-sm text-[#718379]">Manage access for your customer-feedback workspace.</p></header>{error && <p role="alert" className="mt-6 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#a44335]">{error}</p>}<section className="mt-8 overflow-hidden rounded-2xl border border-[#dce5de] bg-white"><div className="border-b border-[#edf2ee] px-5 py-4"><h2 className="font-semibold">People with access</h2></div>{loading ? <p role="status" className="px-5 py-10 text-sm text-[#718379]">Loading members...</p> : <div className="divide-y divide-[#edf2ee]">{members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><p className="font-medium">{member.name}</p><p className="mt-1 text-xs text-[#8a9a90]">{member.email}</p></div><select disabled={pendingMemberIds.has(member.id)} aria-label={`Role for ${member.name}`} value={member.role} onChange={(event) => void changeRole(member.id, event.target.value as Member["role"])} className="rounded-lg border border-[#d6e1d9] bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"><option value="ADMIN">ADMIN</option><option value="ANALYST">ANALYST</option><option value="VIEWER">VIEWER</option></select></div>)}</div>}</section><a href="/dashboard" className="mt-6 inline-block text-sm font-semibold text-[#193c2a] underline underline-offset-4">Back to dashboard</a></div></main>;
}
