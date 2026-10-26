"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";

type InvitationDetails = {
  email: string;
  role: "ANALYST" | "VIEWER";
  workspaceName: string;
  expiresAt: string;
};

type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Form states for unauthenticated signup
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [acceptSuccess, setAcceptSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided. Please check the link from your email.");
      setLoading(false);
      return;
    }

    async function verifyAndCheckAuth() {
      try {
        const [verifyRes, authRes] = await Promise.all([
          fetch(`/api/workspace/invitations/verify?token=${encodeURIComponent(token)}`),
          fetch("/api/auth/me"),
        ]);

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) {
          setError(verifyData.error ?? "This invitation is invalid, expired, or has already been used.");
          setLoading(false);
          return;
        }

        setInvitation(verifyData.data);

        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData.authenticated) {
            setCurrentUser(authData.user);
          }
        }
      } catch {
        setError("Unable to reach the server to verify invitation.");
      } finally {
        setLoading(false);
      }
    }

    void verifyAndCheckAuth();
  }, [token]);

  async function handleAccept(event?: FormEvent) {
    if (event) event.preventDefault();
    if (accepting) return;
    setAccepting(true);
    setError("");

    try {
      const payload: { token: string; name?: string; password?: string } = { token };
      if (!currentUser && name && password) {
        payload.name = name;
        payload.password = password;
      }

      const response = await fetch("/api/workspace/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? "Failed to accept invitation.");
        return;
      }

      setAcceptSuccess(true);
      setTimeout(() => {
        router.push("/inbox");
      }, 2000);
    } catch {
      setError("Network error while accepting invitation. Please try again.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="grid-paper flex min-h-screen items-center justify-center bg-[#f4f7f5] p-5">
      <div className="w-full max-w-md rounded-[28px] border border-[#d6e1d9] bg-[#f8faf8] p-7 shadow-[0_20px_80px_rgba(46,76,56,0.12)] sm:p-10">
        <Link href="/login" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#193c2a] font-bold text-[#d9f36e]">L</span>
          <span className="font-semibold tracking-tight">LOOP</span>
        </Link>

        {loading && (
          <div className="mt-10 py-8 text-center text-sm text-[#718379]">
            <p>Verifying invitation details...</p>
          </div>
        )}

        {error && (
          <div className="mt-8">
            <p role="alert" className="rounded-xl bg-[#fff0ed] px-4 py-3 text-sm text-[#a44335]">
              {error}
            </p>
            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm font-semibold text-[#193c2a] underline underline-offset-4">
                Return to sign in
              </Link>
            </div>
          </div>
        )}

        {acceptSuccess && (
          <div className="mt-8 text-center">
            <p role="status" className="rounded-xl bg-[#e8f1e5] px-4 py-3 text-sm font-medium text-[#2f663f]">
              Invitation accepted! Redirecting you to your workspace...
            </p>
            <Link
              href="/inbox"
              className="mt-6 inline-block rounded-xl bg-[#193c2a] px-6 py-2.5 text-sm font-semibold text-white"
            >
              Open Workspace
            </Link>
          </div>
        )}

        {!loading && !error && !acceptSuccess && invitation && (
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Workspace Invitation</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#193c2a]">
              Join {invitation.workspaceName}
            </h1>
            <p className="mt-2 text-sm text-[#718379]">
              You have been invited to join <strong>{invitation.workspaceName}</strong> as an{" "}
              <strong>{invitation.role}</strong>.
            </p>

            {/* Case 1: Authenticated with matching email */}
            {currentUser && currentUser.email.toLowerCase() === invitation.email.toLowerCase() && (
              <div className="mt-6 space-y-4">
                <p className="rounded-xl bg-[#eaf4ea] p-3 text-xs text-[#3a6847]">
                  Signed in as <strong>{currentUser.email}</strong>.
                </p>
                <button
                  type="button"
                  disabled={accepting}
                  onClick={() => void handleAccept()}
                  className="w-full rounded-xl bg-[#193c2a] px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60 hover:bg-[#235038]"
                >
                  {accepting ? "Accepting..." : "Accept Invitation"}
                </button>
              </div>
            )}

            {/* Case 2: Authenticated with mismatched email */}
            {currentUser && currentUser.email.toLowerCase() !== invitation.email.toLowerCase() && (
              <div className="mt-6 space-y-4">
                <p role="alert" className="rounded-xl bg-[#fff0ed] p-3.5 text-xs text-[#a44335]">
                  You are signed in as <strong>{currentUser.email}</strong>, but this invitation was sent to{" "}
                  <strong>{invitation.email}</strong>. Please switch accounts to accept.
                </p>
                <button
                  type="button"
                  onClick={() => void signOut({ callbackUrl: `/invite/accept?token=${encodeURIComponent(token)}` })}
                  className="w-full rounded-xl border border-[#193c2a] px-4 py-2.5 text-sm font-semibold text-[#193c2a] hover:bg-[#eef4ef]"
                >
                  Sign Out & Switch Account
                </button>
              </div>
            )}

            {/* Case 3: Unauthenticated */}
            {!currentUser && (
              <div className="mt-6">
                <form onSubmit={handleAccept} className="space-y-4">
                  <p className="text-xs text-[#718379]">Set up your details to join with {invitation.email}:</p>
                  <div>
                    <label className="block text-xs font-semibold text-[#53685a]">
                      Your full name
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jane Doe"
                        className="mt-1 w-full rounded-xl border border-[#d6e1d9] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b8d95f]"
                      />
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#53685a]">
                      Create password
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="mt-1 w-full rounded-xl border border-[#d6e1d9] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b8d95f]"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={accepting}
                    className="w-full rounded-xl bg-[#193c2a] px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60 hover:bg-[#235038]"
                  >
                    {accepting ? "Creating account..." : "Create Account & Join"}
                  </button>
                </form>

                <div className="mt-6 border-t border-[#edf2ee] pt-4 text-center">
                  <p className="text-xs text-[#718379]">
                    Already have an account?{" "}
                    <Link
                      href={`/login?callbackUrl=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
                      className="font-semibold text-[#193c2a] underline underline-offset-4"
                    >
                      Sign in first
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <AcceptInvitationContent />
    </Suspense>
  );
}
