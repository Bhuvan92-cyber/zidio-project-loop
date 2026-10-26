import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { memberRoleSchema } from "@/lib/validation/feedback";
import { canChangeMemberRole, canRemoveMember } from "@/lib/workspace/policy";

type Context = { params: { id: string } };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN"]);
    const parsed = memberRoleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    const updated = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${session.user.workspaceId} FOR UPDATE`;
        const member = await tx.user.findFirst({
          where: { id: params.id, workspaceId: session.user.workspaceId },
          select: { id: true, role: true, membershipStatus: true },
        });
        if (!member || member.membershipStatus !== "ACTIVE") {
          return { error: "Member not found.", status: 404 as const };
        }
        const adminCount = await tx.user.count({
          where: { workspaceId: session.user.workspaceId, role: "ADMIN", membershipStatus: "ACTIVE" },
        });
        if (!canChangeMemberRole(session.user.role, member.role, parsed.data.role, session.user.id, member.id, adminCount)) {
          const message = member.id === session.user.id ? "You cannot remove your own admin access." : "The workspace must retain an admin.";
          return { error: message, status: 400 as const };
        }
        const result = await tx.user.updateMany({
          where: { id: params.id, workspaceId: session.user.workspaceId },
          data: { role: parsed.data.role },
        });
        return result.count === 0 ? { error: "Member not found.", status: 404 as const } : { id: params.id, role: parsed.data.role };
      },
      { isolationLevel: "Serializable" },
    );
    if ("error" in updated) return NextResponse.json({ error: updated.error }, { status: updated.status });
    return NextResponse.json({ data: { id: params.id, role: parsed.data.role } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN"]);
    const result = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${session.user.workspaceId} FOR UPDATE`;
        const member = await tx.user.findFirst({
          where: { id: params.id, workspaceId: session.user.workspaceId },
          select: { id: true, role: true, membershipStatus: true },
        });
        if (!member || member.membershipStatus !== "ACTIVE") {
          return { error: "Member not found in this workspace.", status: 404 as const };
        }
        const adminCount = await tx.user.count({
          where: { workspaceId: session.user.workspaceId, role: "ADMIN", membershipStatus: "ACTIVE" },
        });
        if (!canRemoveMember(session.user.role, member.role, session.user.id, member.id, adminCount)) {
          const message = member.id === session.user.id ? "You cannot remove yourself from the workspace." : "The workspace must retain an admin.";
          return { error: message, status: 400 as const };
        }
        await tx.user.update({
          where: { id: params.id },
          data: { membershipStatus: "REVOKED" },
        });
        return { success: true, id: params.id };
      },
      { isolationLevel: "Serializable" },
    );

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ data: { id: params.id, membershipStatus: "REVOKED" } }, { status: 200 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
