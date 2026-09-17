"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className="rounded-lg border border-[#cbdace] px-3 py-2 text-xs font-semibold text-[#53685a] hover:bg-white"
    >
      Sign out
    </button>
  );
}
