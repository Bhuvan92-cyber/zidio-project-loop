"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData)) });
      if (response.status === 202) { setError("We could not create a new workspace with those details."); return; }
      if (!response.ok) { const body = await response.json().catch(() => null); setError(body?.error ?? "We could not create your workspace."); return; }
      await signIn("credentials", { email: formData.get("email"), password: formData.get("password"), callbackUrl: "/inbox" });
    } catch {
      setError("We could not reach the signup service. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <main className="grid-paper flex min-h-screen items-center justify-center bg-[#f4f7f5] p-5"><div className="w-full max-w-md rounded-[28px] border border-[#d6e1d9] bg-[#f8faf8] p-7 shadow-[0_20px_80px_rgba(46,76,56,0.12)] sm:p-10"><Link href="/login" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#193c2a] font-bold text-[#d9f36e]">L</span><span className="font-semibold tracking-tight">LOOP</span></Link><p className="mt-12 text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">Start your workspace</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Close the feedback loop.</h1><form onSubmit={handleSubmit} className="mt-8 space-y-5"><Field label="Your name" name="name" type="text" required /><Field label="Work email" name="email" type="email" required /><Field label="Workspace name" name="workspaceName" type="text" required /><Field label="Password" name="password" type="password" required />{error && <p role="alert" className="rounded-lg bg-[#fff0ed] px-3 py-2 text-sm text-[#a44335]">{error}</p>}<button disabled={pending} className="w-full rounded-xl bg-[#193c2a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Creating workspace..." : "Create workspace"}</button></form><p className="mt-7 text-center text-sm text-[#718379]">Already have access? <Link href="/login" className="font-semibold text-[#193c2a] underline underline-offset-4">Sign in</Link></p></div></main>;
}

function Field({ label, name, type, required }: { label: string; name: string; type: string; required?: boolean }) { return <label className="block text-sm font-medium text-[#34483b]">{label}<input name={name} type={type} required={required} className="mt-2 w-full rounded-xl border border-[#d6e1d9] bg-[#fbfdfb] px-3 py-3 outline-none ring-[#b8d95f] focus:ring-2" /></label>; }
