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

        const email = parsed.data.email;
        if (isLoginRateLimited(email)) {
          console.warn(`[Auth] Sign-in rate limit active for account: ${email}`);
          throw new Error("Too many sign-in attempts. Try again later.");
        }

        let user;
        try {
          user = await db.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              workspaceId: true,
              passwordHash: true,
              membershipStatus: true,
            },
          });
        } catch (dbError: unknown) {
          const message = dbError instanceof Error ? dbError.message : String(dbError);
          const code = (dbError as { code?: string })?.code;

          // Schema backward compatibility: handle unmigrated database missing membershipStatus column
          if (code === "P2022" || /column.*membershipStatus.*does not exist|P2022/i.test(message)) {
            console.warn("[Auth] Schema fallback: membershipStatus column not present; querying base columns.");
            try {
              user = await db.user.findUnique({
                where: { email },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  workspaceId: true,
                  passwordHash: true,
                },
              });
            } catch (fallbackError: unknown) {
              console.error("[Auth] Database error during fallback credentials query:", {
                code: (fallbackError as { code?: string })?.code,
                message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
              });
              throw new Error("The authentication service is temporarily unavailable. Please try again in a few moments.");
            }
          } else {
            console.error("[Auth] Database error during credentials authorization:", {
              code,
              message,
            });
            throw new Error("The authentication service is temporarily unavailable. Please try again in a few moments.");
          }
        }

        if (!user) {
          recordFailedLogin(email);
          return null;
        }

        if ("membershipStatus" in user && user.membershipStatus === "REVOKED") {
          console.warn(`[Auth] Sign-in attempt for revoked account: ${email}`);
          throw new Error("This account has been deactivated. Please contact your workspace administrator.");
        }

        const isMatch = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isMatch) {
          recordFailedLogin(email);
          return null;
        }

        clearLoginFailures(email);
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
