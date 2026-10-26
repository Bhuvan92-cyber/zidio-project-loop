import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashInvitationToken } from "@/lib/workspace/invitation-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token || token.trim().length < 10) {
      return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });
    }

    const tokenDigest = hashInvitationToken(token.trim());
    const invitation = await db.workspaceInvitation.findUnique({
      where: { tokenDigest },
      include: {
        workspace: { select: { name: true } },
      },
    });

    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: "This invitation is invalid, expired, or has already been used." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: {
        email: invitation.email,
        role: invitation.role,
        workspaceName: invitation.workspace.name,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Unable to verify invitation." }, { status: 500 });
  }
}
