import type { PrismaClient } from "../../generated/prisma/client.js";

export type UsageKind = "ai_document" | "email";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Records `amount` uses of `kind` for the user if that keeps them within `limit` over the last
 * 24 hours, and returns whether it did. A limit of 0 disables the action.
 */
export async function consumeQuota(prisma: PrismaClient, userId: string, kind: UsageKind, limit: number, amount = 1): Promise<boolean> {
  const used = await prisma.usageEvent.count({
    where: { userId, kind, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  if (used + amount > limit) {
    return false;
  }
  await prisma.usageEvent.createMany({ data: Array.from({ length: amount }, () => ({ userId, kind })) });
  return true;
}
