import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth/config";
import { hashInvitationToken } from "@/lib/workspace/invitation-token";
import { invitationAcceptSchema } from "@/lib/validation/invitation";
import { authErrorResponse } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = invitationAcceptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid acceptance request." }, { status: 400 });
    }

    const { token, name, password } = parsed.data;
    const tokenDigest = hashInvitationToken(token.trim());

    const session = await getServerSession(authOptions);

    const result = await db.$transaction(
      async (tx) => {
        // Find invitation by token digest with row locking on Workspace
        const invitation = await tx.workspaceInvitation.findUnique({
          where: { tokenDigest },
          include: { workspace: { select: { id: true, name: true } } },
        });

        if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) {
          return { error: "This invitation is invalid, expired, or has already been used.", status: 400 as const };
        }

        // Lock workspace to prevent concurrent modification conflicts
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${invitation.workspaceId} FOR UPDATE`;

        // Case 1: Authenticated session
        if (session?.user?.id) {
          const authUser = await tx.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, email: true, workspaceId: true, membershipStatus: true },
          });

          if (!authUser) {
            return { error: "Authenticated user not found.", status: 401 as const };
          }

          if (authUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
            return {
              error: `You are signed in as ${authUser.email}, but this invitation was sent to ${invitation.email}. Please switch accounts.`,
              status: 403 as const,
            };
          }

          if (authUser.workspaceId === invitation.workspaceId && authUser.membershipStatus === "ACTIVE") {
            return { error: "You are already an active member of this workspace.", status: 409 as const };
          }

          // Atomically update user and mark invitation ACCEPTED
          await tx.user.update({
            where: { id: authUser.id },
            data: {
              workspaceId: invitation.workspaceId,
              role: invitation.role,
              membershipStatus: "ACTIVE",
            },
          });

          await tx.workspaceInvitation.update({
            where: { id: invitation.id },
            data: {
              status: "ACCEPTED",
              acceptedAt: new Date(),
              acceptedById: authUser.id,
            },
          });

          return {
            success: true,
            status: 200 as const,
            data: {
              workspaceId: invitation.workspaceId,
              role: invitation.role,
              workspaceName: invitation.workspace.name,
            },
          };
        }

        // Case 2: Unauthenticated with registration details
        if (name && password) {
          const existingUser = await tx.user.findUnique({
            where: { email: invitation.email },
          });

          if (existingUser) {
            return {
              error: "An account already exists for this email. Please sign in to accept the invitation.",
              status: 401 as const,
            };
          }

          const passwordHash = await bcrypt.hash(password, 12);
          const newUser = await tx.user.create({
            data: {
              name,
              email: invitation.email,
              passwordHash,
              workspaceId: invitation.workspaceId,
              role: invitation.role,
              membershipStatus: "ACTIVE",
            },
            select: { id: true },
          });

          await tx.workspaceInvitation.update({
            where: { id: invitation.id },
            data: {
              status: "ACCEPTED",
              acceptedAt: new Date(),
              acceptedById: newUser.id,
            },
          });

          return {
            success: true,
            status: 201 as const,
            data: {
              workspaceId: invitation.workspaceId,
              role: invitation.role,
              workspaceName: invitation.workspace.name,
            },
          };
        }

        return { error: "Authentication is required before completing membership assignment.", status: 401 as const };
      },
      { isolationLevel: "Serializable" },
    );

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: result.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
