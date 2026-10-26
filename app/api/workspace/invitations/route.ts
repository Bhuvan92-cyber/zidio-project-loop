import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { invitationCreateSchema } from "@/lib/validation/invitation";
import { generateInvitationToken } from "@/lib/workspace/invitation-token";
import { sendWorkspaceInvitationEmail } from "@/lib/email/service";
import { canInviteRole } from "@/lib/workspace/policy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireRole(["ADMIN"]);
    const invitations = await db.workspaceInvitation.findMany({
      where: { workspaceId: session.user.workspaceId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        resentAt: true,
        invitedBy: {
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: invitations });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(["ADMIN"]);
    const body = await request.json().catch(() => null);
    const parsed = invitationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid invitation input." }, { status: 400 });
    }

    const { email, role } = parsed.data;

    if (!canInviteRole(session.user.role, role)) {
      return NextResponse.json({ error: "Invitations are restricted to ANALYST and VIEWER roles." }, { status: 400 });
    }

    // Check if the user is already an active member in this workspace
    const existingMember = await db.user.findFirst({
      where: {
        workspaceId: session.user.workspaceId,
        email,
        membershipStatus: "ACTIVE",
      },
    });
    if (existingMember) {
      return NextResponse.json({ error: "User is already an active member of this workspace." }, { status: 409 });
    }

    // Check if there is already an active pending invitation
    const existingInvitation = await db.workspaceInvitation.findFirst({
      where: {
        workspaceId: session.user.workspaceId,
        email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvitation) {
      return NextResponse.json(
        { error: "An active invitation is already pending for this email. Use resend to send a new link." },
        { status: 409 },
      );
    }

    const workspace = await db.workspace.findUnique({
      where: { id: session.user.workspaceId },
      select: { name: true },
    });
    if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

    const { rawToken, tokenDigest } = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await db.workspaceInvitation.create({
      data: {
        workspaceId: session.user.workspaceId,
        email,
        role,
        invitedById: session.user.id,
        tokenDigest,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const emailResult = await sendWorkspaceInvitationEmail({
      toEmail: email,
      workspaceName: workspace.name,
      inviterName: session.user.name,
      role,
      rawToken,
      expiresAt,
    });

    return NextResponse.json(
      {
        data: {
          ...invitation,
          emailSent: emailResult.success,
          ...(emailResult.error ? { emailError: emailResult.error } : {}),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
