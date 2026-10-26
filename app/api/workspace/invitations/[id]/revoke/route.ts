import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";

type Context = { params: { id: string } };

export async function POST(_request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN"]);

    const invitation = await db.workspaceInvitation.findFirst({
      where: { id: params.id, workspaceId: session.user.workspaceId },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }

    if (invitation.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending invitations can be revoked." }, { status: 400 });
    }

    const updated = await db.workspaceInvitation.update({
      where: { id: params.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        status: true,
        revokedAt: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return authErrorResponse(error);
  }
}
