import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { z } from "zod";
import type { signupSchema } from "@/lib/validation/auth";

export type SignupInput = z.infer<typeof signupSchema>;
type SignupResult = { id: string; name: string; email: string; role: "ADMIN"; workspaceId: string; passwordHash: string };
type SignupDatabase = { user: { create: (args: { data: unknown; select: unknown }) => Promise<SignupResult> } };

export async function createWorkspaceAdmin(input: SignupInput, client: SignupDatabase = db as unknown as SignupDatabase) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  return client.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: "ADMIN",
      workspace: { create: { name: input.workspaceName } },
    },
    select: { id: true, name: true, email: true, role: true, workspaceId: true, passwordHash: true },
  });
}
