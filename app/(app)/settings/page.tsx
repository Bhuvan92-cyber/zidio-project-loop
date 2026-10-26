"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Member = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "ANALYST" | "VIEWER";
  membershipStatus?: "ACTIVE" | "REVOKED";
  createdAt: string;
};

type Invitation = {
  id: string;
  email: string;
  role: "ANALYST" | "VIEWER";
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
  resentAt?: string | null;
  invitedBy?: { name: string; email: string };
};

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [pendingMemberIds, setPendingMemberIds] = useState<Set<string>>(new Set());

  // Invitation form state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ANALYST" | "VIEWER">("ANALYST");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Remove confirmation modal state
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [removePending, setRemovePending] = useState(false);

  // Invitation action pending state
  const [pendingInvitationIds, setPendingInvitationIds] = useState<Set<string>>(new Set());

  async function loadData() {
    setError("");
    setIsUnauthorized(false);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch("/api/workspace/members"),
        fetch("/api/workspace/invitations"),
      ]);

      if (membersRes.status === 403) {
        setIsUnauthorized(true);
        setError("Only workspace admins can manage members.");
        setLoading(false);
        return;
      }

      if (!membersRes.ok) {
        setError("Members could not be loaded.");
        setLoading(false);
        return;
      }

      const membersData = await membersRes.json();
      setMembers(membersData.data ?? []);

      if (invitesRes.ok) {
        const invitesData = await invitesRes.json();
        setInvitations(invitesData.data ?? []);
      }
    } catch {
      setError("Members could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
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
      setMembers((current) => current.map((member) => (member.id === id ? { ...member, role } : member)));
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

  async function confirmRemoveMember() {
    if (!memberToRemove || removePending) return;
    setError("");
    setSuccess("");
    setRemovePending(true);
    try {
      const response = await fetch(`/api/workspace/members/${memberToRemove.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Member could not be removed.");
        return;
      }
      setMembers((current) => current.filter((m) => m.id !== memberToRemove.id));
      setSuccess(`Removed ${memberToRemove.name} from the workspace.`);
      setMemberToRemove(null);
    } catch {
      setError("Failed to remove member. Please try again.");
    } finally {
      setRemovePending(false);
    }
  }

  async function handleSendInvitation(event: FormEvent) {
    event.preventDefault();
    if (invitePending) return;
    setInviteError("");
    setError("");
    setSuccess("");
    setInvitePending(true);
    try {
      const response = await fetch("/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setInviteError(data?.error ?? "Failed to send invitation.");
        return;
      }
      setSuccess(`Invitation sent to ${inviteEmail} as ${inviteRole}.`);
      setInviteEmail("");
      setShowInviteModal(false);
      await loadData();
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setInvitePending(false);
    }
  }

  async function handleResendInvitation(invitationId: string) {
    if (pendingInvitationIds.has(invitationId)) return;
    setError("");
    setSuccess("");
    setPendingInvitationIds((cur) => new Set(cur).add(invitationId));
    try {
      const response = await fetch(`/api/workspace/invitations/${invitationId}/resend`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Failed to resend invitation.");
        return;
      }
      setSuccess(`Invitation resent to ${data.data.email}.`);
      await loadData();
    } catch {
      setError("Failed to resend invitation.");
    } finally {
      setPendingInvitationIds((cur) => {
        const next = new Set(cur);
        next.delete(invitationId);
        return next;
      });
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (pendingInvitationIds.has(invitationId)) return;
    if (!confirm("Are you sure you want to revoke this invitation? The recipient will not be able to join.")) return;
    setError("");
    setSuccess("");
    setPendingInvitationIds((cur) => new Set(cur).add(invitationId));
    try {
      const response = await fetch(`/api/workspace/invitations/${invitationId}/revoke`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Failed to revoke invitation.");
        return;
      }
      setSuccess("Invitation revoked successfully.");
      await loadData();
    } catch {
      setError("Failed to revoke invitation.");
    } finally {
      setPendingInvitationIds((cur) => {
        const next = new Set(cur);
        next.delete(invitationId);
        return next;
      });
    }
  }

  // 1. Distinguishable Unauthorized State: Non-admin users see a clean access restricted screen
  if (isUnauthorized) {
    return (
      <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-[#dce5de] bg-white p-8 text-center shadow-sm sm:p-12">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#fff0ed] text-2xl text-[#a44335]">
            🔒
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">
            Workspace / Access Control
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#193c2a] sm:text-3xl">
            Access Restricted
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#718379]">
            Only workspace administrators have permission to view members, manage roles, and issue invitations.
          </p>
          <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-2.5 text-xs font-medium text-[#a44335]">
            Only workspace admins can manage members.
          </p>
          <div className="mt-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-[#193c2a] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#235038]"
            >
              Return to dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const activeMembers = members.filter((m) => m.membershipStatus !== "REVOKED");

  return (
    <main className="min-h-screen bg-[#f4f7f5] p-5 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Workspace / Settings</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Workspace members</h1>
            <p className="mt-2 text-sm text-[#718379]">Manage access, roles, and permissions for your workspace team.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setInviteError("");
                setShowInviteModal(true);
              }}
              className="rounded-xl bg-[#193c2a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#235038]"
            >
              + Invite Member
            </button>
            <Link href="/dashboard" className="text-sm font-semibold text-[#193c2a] underline underline-offset-4">
              Back to dashboard
            </Link>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-6 rounded-xl bg-[#fff0ed] p-4 text-sm text-[#a44335]">
            <div className="flex items-center justify-between gap-3">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadData()}
                className="rounded-lg bg-[#a44335] px-3 py-1 text-xs font-semibold text-white hover:bg-[#86372b]"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {success && (
          <p role="status" className="mt-6 rounded-xl bg-[#e8f1e5] px-4 py-3 text-sm text-[#53725e]">
            {success}
          </p>
        )}

        {/* Member Invitation Modal / Form */}
        {showInviteModal && (
          <div className="mt-6 rounded-2xl border border-[#b8d95f] bg-[#fbfdfb] p-6 shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#193c2a]">Invite a new workspace member</h2>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-xs font-semibold text-[#718379] hover:text-[#17221d]"
              >
                ✕ Cancel
              </button>
            </div>
            <p className="mt-1 text-xs text-[#718379]">
              Enter the colleague&apos;s email and select an allowed role (ANALYST or VIEWER). An invitation link will be sent to them.
            </p>

            <form onSubmit={handleSendInvitation} className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
              <label className="text-xs font-semibold text-[#53685a]">
                Email address
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="mt-1.5 w-full rounded-xl border border-[#d6e1d9] bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b8d95f]"
                />
              </label>

              <label className="text-xs font-semibold text-[#53685a]">
                Role
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "ANALYST" | "VIEWER")}
                  className="mt-1.5 w-full rounded-xl border border-[#d6e1d9] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-[#b8d95f]"
                >
                  <option value="ANALYST">ANALYST</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={invitePending}
                  className="rounded-xl bg-[#193c2a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 hover:bg-[#235038]"
                >
                  {invitePending ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>

            {inviteError && (
              <p role="alert" className="mt-3 text-sm text-[#a44335]">
                {inviteError}
              </p>
            )}
          </div>
        )}

        {/* Remove Member Confirmation Dialog */}
        {memberToRemove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-[#193c2a]">Confirm Member Removal</h3>
              <p className="mt-2 text-sm text-[#53685a]">
                Are you sure you want to remove <strong>{memberToRemove.name}</strong> ({memberToRemove.email}) from this workspace?
                Their access will be revoked immediately.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={removePending}
                  onClick={() => setMemberToRemove(null)}
                  className="rounded-xl border border-[#d6e1d9] px-4 py-2 text-sm font-medium text-[#53685a] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={removePending}
                  onClick={() => void confirmRemoveMember()}
                  className="rounded-xl bg-[#c53929] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a42b1d] disabled:opacity-50"
                >
                  {removePending ? "Removing..." : "Remove Member"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Member List */}
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

          {!loading && activeMembers.length === 0 && (
            <p role="status" className="px-5 py-10 text-sm text-[#718379]">
              No workspace members found.
            </p>
          )}

          {!loading && activeMembers.length > 0 && (
            <div className="divide-y divide-[#edf2ee]">
              {activeMembers.map((member) => {
                const isPending = pendingMemberIds.has(member.id);
                return (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[#193c2a]">{member.name}</p>
                        <span className="rounded-md bg-[#edf4ef] px-2 py-0.5 text-[11px] font-semibold text-[#486353]">
                          {member.role}
                        </span>
                        <span className="rounded-md bg-[#eaf4ea] px-2 py-0.5 text-[10px] font-medium text-[#2f663f]">
                          Active
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
                      <button
                        type="button"
                        disabled={isPending}
                        aria-label={`Remove ${member.name}`}
                        onClick={() => setMemberToRemove(member)}
                        className="rounded-lg border border-[#d6e1d9] px-3 py-2 text-xs font-semibold text-[#a44335] hover:bg-[#fff0ed] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Pending Invitations Section */}
        <section className="mt-8 overflow-hidden rounded-2xl border border-[#dce5de] bg-white shadow-sm">
          <div className="border-b border-[#edf2ee] px-5 py-4">
            <h2 className="font-semibold text-[#193c2a]">Invitations</h2>
            <p className="mt-1 text-xs text-[#718379]">Manage pending invitations sent to prospective workspace analysts and viewers.</p>
          </div>

          {invitations.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[#718379]">No invitations currently active.</p>
          ) : (
            <div className="divide-y divide-[#edf2ee]">
              {invitations.map((inv) => {
                const isPendingAction = pendingInvitationIds.has(inv.id);
                const isExpired = new Date(inv.expiresAt) <= new Date();
                const displayStatus = inv.status === "PENDING" && isExpired ? "EXPIRED" : inv.status;

                return (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[#193c2a]">{inv.email}</p>
                        <span className="rounded-md bg-[#edf4ef] px-2 py-0.5 text-[11px] font-semibold text-[#486353]">
                          {inv.role}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                            displayStatus === "PENDING"
                              ? "bg-[#fff8e1] text-[#8d6e10]"
                              : displayStatus === "ACCEPTED"
                              ? "bg-[#e8f1e5] text-[#3e6b48]"
                              : "bg-[#f5f5f5] text-[#757575]"
                          }`}
                        >
                          {displayStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#8a9a90]">
                        Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                        {inv.resentAt && ` · Resent: ${new Date(inv.resentAt).toLocaleDateString()}`}
                      </p>
                    </div>

                    {inv.status === "PENDING" && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isPendingAction}
                          onClick={() => void handleResendInvitation(inv.id)}
                          className="rounded-lg border border-[#193c2a] px-3 py-1.5 text-xs font-semibold text-[#193c2a] hover:bg-[#eef4ef] disabled:opacity-50"
                        >
                          {isPendingAction ? "Processing..." : "Resend"}
                        </button>
                        <button
                          type="button"
                          disabled={isPendingAction}
                          onClick={() => void handleRevokeInvitation(inv.id)}
                          className="rounded-lg border border-[#d6e1d9] px-3 py-1.5 text-xs font-semibold text-[#a44335] hover:bg-[#fff0ed] disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Role Permissions Guide */}
        <div className="mt-8 rounded-2xl border border-[#dce5de] bg-[#f8faf8] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#789181]">Role Permissions Guide</h3>
          <ul className="mt-3 space-y-1.5 text-xs text-[#53685a]">
            <li><strong>ADMIN:</strong> Full control including managing members, sending invitations, reclassifying, and deleting feedback.</li>
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
