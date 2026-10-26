import type { Role } from "@prisma/client";

export function canChangeMemberRole(actorRole: Role, targetRole: Role, nextRole: Role, actorId: string, targetId: string, adminCount: number) {
  if (actorRole !== "ADMIN") return false;
  if (actorId === targetId && nextRole !== "ADMIN") return false;
  if (targetRole === "ADMIN" && nextRole !== "ADMIN" && adminCount <= 1) return false;
  return true;
}

export function canRemoveMember(actorRole: Role, targetRole: Role, actorId: string, targetId: string, adminCount: number) {
  if (actorRole !== "ADMIN") return false;
  if (actorId === targetId) return false;
  if (targetRole === "ADMIN" && adminCount <= 1) return false;
  return true;
}

export function canInviteRole(actorRole: Role, invitedRole: string): invitedRole is "ANALYST" | "VIEWER" {
  if (actorRole !== "ADMIN") return false;
  if (invitedRole !== "ANALYST" && invitedRole !== "VIEWER") return false;
  return true;
}
