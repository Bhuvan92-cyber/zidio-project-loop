import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { memberRoleSchema } from "@/lib/validation/feedback";
import { canChangeMemberRole } from "@/lib/workspace/policy";

type Context = { params: { id: string } };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await requireRole(["ADMIN"]);
    const parsed = memberRoleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    const updated = await db.$transaction(async (tx) => {
      const member = await tx.user.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId }, select: { id: true, role: true } });
      if (!member) return { error: "Member not found.", status: 404 as const };
      if (!canChangeMemberRole(session.user.role, member.role, parsed.data.role, session.user.id, member.id, await tx.user.count({ where: { workspaceId: session.user.workspaceId, role: "ADMIN" } }))) {
        const message = member.id === session.user.id ? "You cannot remove your own admin access." : "The workspace must retain an admin.";
        return { error: message, status: 400 as const };
      }
      const result = await tx.user.updateMany({ where: { id: params.id, workspaceId: session.user.workspaceId }, data: { role: parsed.data.role } });
      return result.count === 0 ? { error: "Member not found.", status: 404 as const } : { id: params.id, role: parsed.data.role };
    }, { isolationLevel: "Serializable" });
    if ("error" in updated) return NextResponse.json({ error: updated.error }, { status: updated.status });
    return NextResponse.json({ data: { id: params.id, role: parsed.data.role } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
