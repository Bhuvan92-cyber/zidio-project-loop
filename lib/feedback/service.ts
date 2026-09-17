import type { FeedbackStatus, Prisma, PrismaClient, Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { FeedbackQuery } from "@/lib/validation/feedback";

export type Database = Pick<PrismaClient, "feedback">;

const writableRoles: Role[] = ["ADMIN", "ANALYST"];

const allowedTransitions: Record<FeedbackStatus, FeedbackStatus | null> = {
  NEW: "REVIEWED",
  REVIEWED: "ACTIONED",
  ACTIONED: null,
};

export function canTransitionFeedbackStatus(current: FeedbackStatus, next: FeedbackStatus) {
  return allowedTransitions[current] === next;
}

export class InvalidFeedbackTransitionError extends Error {
  constructor(current: FeedbackStatus, next: FeedbackStatus) {
    super(`Feedback cannot transition from ${current} to ${next}.`);
    this.name = "InvalidFeedbackTransitionError";
  }
}

export function canWriteFeedback(role: Role) {
  return writableRoles.includes(role);
}

export async function listFeedback(workspaceId: string, query: FeedbackQuery, client: Database = db) {
  const endExclusive = query.endDate ? new Date(`${query.endDate}T00:00:00.000Z`) : null;
  if (endExclusive) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const where: Prisma.FeedbackWhereInput = {
    workspaceId,
    ...(query.search ? { content: { contains: query.search, mode: "insensitive" } } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.sentiment ? { sentiment: query.sentiment } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.themeId ? { themes: { some: { themeId: query.themeId, workspaceId } } } : {}),
    ...(query.startDate || endExclusive ? { createdAt: { ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}), ...(endExclusive ? { lt: endExclusive } : {}) } } : {}),
  };
  const [data, total] = await Promise.all([
    client.feedback.findMany({ where, orderBy: { [query.sort]: query.direction }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { themes: { include: { theme: true } } } }),
    client.feedback.count({ where }),
  ]);
  return { data, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
}

export async function getFeedback(workspaceId: string, feedbackId: string, client: Database = db) {
  return client.feedback.findFirst({ where: { id: feedbackId, workspaceId }, include: { themes: { include: { theme: true } } } });
}

export type FeedbackCreateInput = Omit<Prisma.FeedbackUncheckedCreateInput, "workspaceId" | "createdAt"> & { createdAt?: Date };

export async function createFeedback(workspaceId: string, input: FeedbackCreateInput, client: Database = db) {
  return client.feedback.create({ data: { ...input, workspaceId } });
}

export async function createFeedbackBatch(workspaceId: string, inputs: FeedbackCreateInput[]) {
  return db.$transaction(async (transaction) => {
    const created = [];
    for (const input of inputs) created.push(await createFeedback(workspaceId, input, transaction));
    return created;
  });
}

export async function updateFeedback(workspaceId: string, feedbackId: string, input: Prisma.FeedbackUpdateInput, client: Database = db) {
  let currentStatus: FeedbackStatus | undefined;
  if (input.status !== undefined && typeof input.status === "string") {
    const current = await client.feedback.findFirst({ where: { id: feedbackId, workspaceId }, select: { status: true } });
    if (!current) return null;
    currentStatus = current.status;
    if (!canTransitionFeedbackStatus(current.status, input.status as FeedbackStatus)) throw new InvalidFeedbackTransitionError(current.status, input.status as FeedbackStatus);
  }
  const result = await client.feedback.updateMany({ where: { id: feedbackId, workspaceId, ...(input.status !== undefined && typeof input.status === "string" ? { status: currentStatus } : {}) }, data: input });
  if (result.count === 0) return null;
  return getFeedback(workspaceId, feedbackId, client);
}

export async function deleteFeedback(workspaceId: string, feedbackId: string, client: Database = db) {
  const result = await client.feedback.deleteMany({ where: { id: feedbackId, workspaceId } });
  return result.count > 0;
}
