import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { authenticated: false },
        {
          status: 401,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        }
      );
    }

    let user;

    try {
      user = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          workspaceId: true,
          membershipStatus: true,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as { code?: string })?.code;

      const missingMembershipStatus =
        code === "P2022" ||
        /column.*membershipStatus.*does not exist/i.test(message);

      if (!missingMembershipStatus) {
        throw error;
      }

      console.warn(
        "[Auth] Schema fallback in /api/auth/me: membershipStatus column missing."
      );

      user = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          workspaceId: true,
        },
      });
    }

    if (!user) {
      return NextResponse.json(
        { authenticated: false },
        {
          status: 401,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        }
      );
    }

    if (
      "membershipStatus" in user &&
      user.membershipStatus !== "ACTIVE"
    ) {
      return NextResponse.json(
        { authenticated: false },
        {
          status: 401,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        }
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          workspaceId: user.workspaceId,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "Auth check failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      { authenticated: false },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    );
  }
}
