import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validation/auth";
import { clearLoginFailures, isLoginRateLimited, recordFailedLogin } from "@/lib/auth/login-policy";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        if (isLoginRateLimited(parsed.data.email)) throw new Error("Too many sign-in attempts. Try again later.");
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
          recordFailedLogin(parsed.data.email);
          return null;
        }
        clearLoginFailures(parsed.data.email);
        return { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspaceId };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.workspaceId = user.workspaceId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role ?? "VIEWER";
        session.user.workspaceId = token.workspaceId ?? "";
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};
