"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", { email: formData.get("email"), password: formData.get("password"), redirect: false });
      if (result?.error) setError("We could not sign you in with those details.");
      else router.push("/inbox");
    } catch {
      setError("We could not reach the sign-in service. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <AuthFrame eyebrow="Welcome back" title="Your customer voice, in focus."><form onSubmit={handleSubmit} className="space-y-5"><Field label="Work email" name="email" type="email" required /><Field label="Password" name="password" type="password" required /><div className="flex items-center justify-between text-xs text-[#718379]"><span>Secure workspace access</span><span>Forgot password?</span></div>{error && <p role="alert" className="rounded-lg bg-[#fff0ed] px-3 py-2 text-sm text-[#a44335]">{error}</p>}<button disabled={pending} className="w-full rounded-xl bg-[#193c2a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Signing in..." : "Sign in"}</button></form><p className="mt-7 text-center text-sm text-[#718379]">New to LOOP? <Link href="/signup" className="font-semibold text-[#193c2a] underline underline-offset-4">Create a workspace</Link></p></AuthFrame>;
}

function Field({ label, name, type, required }: { label: string; name: string; type: string; required?: boolean }) { return <label className="block text-sm font-medium text-[#34483b]">{label}<input name={name} type={type} required={required} className="mt-2 w-full rounded-xl border border-[#d6e1d9] bg-[#fbfdfb] px-3 py-3 outline-none ring-[#b8d95f] focus:ring-2" /></label>; }
function AuthFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) { return <main className="grid-paper flex min-h-screen items-center justify-center bg-[#f4f7f5] p-5"><div className="w-full max-w-md rounded-[28px] border border-[#d6e1d9] bg-[#f8faf8] p-7 shadow-[0_20px_80px_rgba(46,76,56,0.12)] sm:p-10"><Link href="/login" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#193c2a] font-bold text-[#d9f36e]">L</span><span className="font-semibold tracking-tight">LOOP</span></Link><p className="mt-12 text-xs font-semibold uppercase tracking-[0.2em] text-[#789181]">{eyebrow}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{title}</h1><div className="mt-8">{children}</div></div></main>; }
