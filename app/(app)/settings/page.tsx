"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Member = { id: string; name: string; email: string; role: "ADMIN" | "ANALYST" | "VIEWER" };

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingMemberIds, setPendingMemberIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetch("/api/workspace/members").then(async (response) => {
      if (!response.ok) {
        setError(response.status === 403 ? "Only workspace admins can manage members." : "Members could not be loaded.");
        setLoading(false);
        return;
      }
      const body = await response.json();
      setMembers(body.data ?? []);
      setLoading(false);
    }).catch(() => {
      setError("Members could not be loaded. Please try again.");
      setLoading(false);
    });
  }, []);

  async function changeRole(id: string, role: Member["role"]) {
    if (pendingMemberIds.has(id)) return;
    setError("");
    setSuccess("");
    setPendingMemberIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/workspace/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Role could not be updated.");
        return;
      }
      setMembers((current) => current.map((member) => member.id === id ? { ...member, role } : member));
      const targetMember = members.find((m) => m.id === id);
      setSuccess(`Updated ${targetMember ? targetMember.name : "member"} to ${role}.`);
    } catch {
      setError("Role could not be updated. Please try again.");
    } finally {
      setPendingMemberIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Workspace / Settings</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Workspace members</h1>
            <p className="mt-2 text-sm text-[#718379]">Manage access, roles, and permissions for your workspace team.</p>
          </div>
          <Link href="/dashboard" className="text-sm font-semibold text-[#193c2a] underline underline-offset-4">
            Back to dashboard
          </Link>
        </header>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#a44335]">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="mt-6 rounded-xl bg-[#e8f1e5] px-4 py-3 text-sm text-[#53725e]">
            {success}
          </p>
        )}

        <section className="mt-8 overflow-hidden rounded-2xl border border-[#dce5de] bg-white shadow-sm">
          <div className="border-b border-[#edf2ee] px-5 py-4">
            <h2 className="font-semibold text-[#193c2a]">People with access</h2>
            <p className="mt-1 text-xs text-[#718379]">Assign ADMIN, ANALYST, or VIEWER permissions to members.</p>
          </div>

          {loading && (
            <p role="status" className="px-5 py-10 text-sm text-[#718379]">
              Loading members...
            </p>
          )}

          {!loading && members.length === 0 && (
            <p role="status" className="px-5 py-10 text-sm text-[#718379]">
              No workspace members found.
            </p>
          )}

          {!loading && members.length > 0 && (
            <div className="divide-y divide-[#edf2ee]">
              {members.map((member) => {
                const isPending = pendingMemberIds.has(member.id);
                return (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[#193c2a]">{member.name}</p>
                        <span className="rounded-md bg-[#edf4ef] px-2 py-0.5 text-[11px] font-semibold text-[#486353]">
                          {member.role}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#8a9a90]">{member.email}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <label htmlFor={`role-select-${member.id}`} className="sr-only">
                        Role for {member.name}
                      </label>
                      <select
                        id={`role-select-${member.id}`}
                        disabled={isPending}
                        aria-label={`Role for ${member.name}`}
                        value={member.role}
                        onChange={(event) => void changeRole(member.id, event.target.value as Member["role"])}
                        className="rounded-lg border border-[#d6e1d9] bg-white px-3 py-2 text-xs font-semibold text-[#193c2a] shadow-sm disabled:opacity-50"
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="ANALYST">ANALYST</option>
                        <option value="VIEWER">VIEWER</option>
                      </select>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => void changeRole(member.id, member.role)}
                        className="rounded-lg border border-[#193c2a] px-3 py-2 text-xs font-semibold text-[#193c2a] hover:bg-[#eef4ef] disabled:opacity-50"
                      >
                        {isPending ? "Updating..." : "Save"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-8 rounded-2xl border border-[#dce5de] bg-[#f8faf8] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#789181]">Role Permissions Guide</h3>
          <ul className="mt-3 space-y-1.5 text-xs text-[#53685a]">
            <li><strong>ADMIN:</strong> Full control including managing members, reclassifying, and deleting feedback.</li>
            <li><strong>ANALYST:</strong> Can view data, create feedback, run CSV imports, and generate reports.</li>
            <li><strong>VIEWER:</strong> Read-only access to dashboard, reports, trends, and feedback items.</li>
          </ul>
        </div>

        <Link href="/dashboard" className="mt-6 inline-block text-sm font-semibold text-[#193c2a] underline underline-offset-4">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
