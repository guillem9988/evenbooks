import type { PrismaClient } from "../../generated/prisma/client.js";

export type UsageKind = "ai_document" | "email";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last 24 hours. */
export function lastDay(now = new Date()): Date {
  return new Date(now.getTime() - DAY_MS);
}

/** The first instant of the current calendar month (UTC), when monthly allowances start again. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The first instant of next month (UTC): when a monthly allowance resets. */
export function nextMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function countUsage(prisma: PrismaClient, userId: string, kind: UsageKind, since: Date): Promise<number> {
  return prisma.usageEvent.count({ where: { userId, kind, createdAt: { gte: since } } });
}

/**
 * Records `amount` uses of `kind` for the user if that keeps them within `limit` since `since`
 * (by default the last 24 hours), and returns whether it did. A limit of 0 disables the action.
 */
export async function consumeQuota(
  prisma: PrismaClient,
  userId: string,
  kind: UsageKind,
  limit: number,
  amount = 1,
  since: Date = lastDay(),
): Promise<boolean> {
  const used = await countUsage(prisma, userId, kind, since);
  if (used + amount > limit) {
    return false;
  }
  await prisma.usageEvent.createMany({ data: Array.from({ length: amount }, () => ({ userId, kind })) });
  return true;
}
