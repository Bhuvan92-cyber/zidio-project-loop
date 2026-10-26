import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireRole(["ADMIN"]);
    let members;
    try {
      members = await db.user.findMany({
        where: {
          workspaceId: session.user.workspaceId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          membershipStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      });
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      const code = (dbError as { code?: string })?.code;
      if (code === "P2022" || /column.*membershipStatus.*does not exist|P2022/i.test(message)) {
        members = await db.user.findMany({
          where: {
            workspaceId: session.user.workspaceId,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        });
      } else {
        throw dbError;
      }
    }
    return NextResponse.json({ data: members });
  } catch (error) {
    return authErrorResponse(error);
  }
}
