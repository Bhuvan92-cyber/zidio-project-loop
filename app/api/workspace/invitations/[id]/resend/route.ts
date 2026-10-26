import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { generateInvitationToken } from "@/lib/workspace/invitation-token";
import { sendWorkspaceInvitationEmail } from "@/lib/email/service";

type Context = { params: { id: string } };

export async function POST(_request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN"]);

    const invitation = await db.workspaceInvitation.findFirst({
      where: { id: params.id, workspaceId: session.user.workspaceId },
      include: { workspace: { select: { name: true } } },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }

    if (invitation.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending invitations can be resent." }, { status: 400 });
    }

    // Token rotation: generate new rawToken and tokenDigest
    const { rawToken, tokenDigest } = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const resentAt = new Date();

    const updated = await db.workspaceInvitation.update({
      where: { id: params.id },
      data: {
        tokenDigest,
        expiresAt,
        resentAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        resentAt: true,
      },
    });

    const emailResult = await sendWorkspaceInvitationEmail({
      toEmail: updated.email,
      workspaceName: invitation.workspace.name,
      inviterName: session.user.name,
      role: updated.role,
      rawToken,
      expiresAt,
    });

    return NextResponse.json({
      data: {
        ...updated,
        emailSent: emailResult.success,
        ...(emailResult.error ? { emailError: emailResult.error } : {}),
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
