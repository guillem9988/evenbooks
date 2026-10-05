import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { CookieConfig } from "../config.js";
import {
  checkPassword,
  hashPassword,
  LOCAL_COOKIE,
  readPassword,
  SESSION_COOKIE,
  sessionCookieAttributes,
  userIdFromRequest,
} from "../auth/session.js";

/**
 * DELETE /auth/account: the person deletes their own account (GDPR erasure). Organizations they are
 * the only member of are deleted with everything in them, including uploaded files; organizations
 * shared with others stay, and only this person's membership goes.
 */
export function registerAccountRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  deleteStoredFile: (key: string) => Promise<void>,
  cookie: CookieConfig = LOCAL_COOKIE,
): void {
  /**
   * POST /auth/change-password: needs the current password. Every other session of the account is
   * signed out, so a stolen session stops working once its owner changes the password.
   */
  app.post("/auth/change-password", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const userId = await userIdFromRequest(prisma, request);
    if (userId === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    const body = (request.body as { currentPassword?: unknown; newPassword?: unknown } | undefined) ?? {};
    const newPassword = readPassword(body.newPassword);
    if (newPassword instanceof Error) {
      return reply.code(400).send({ error: newPassword.message });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (user === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    // Google-only accounts set a first password through the emailed reset link instead.
    if (!user.passwordHash || typeof body.currentPassword !== "string" || !(await checkPassword(body.currentPassword, user.passwordHash))) {
      return reply.code(403).send({ error: "Current password is incorrect" });
    }
    const currentToken = request.cookies[SESSION_COOKIE] ?? "";
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } }),
      prisma.session.deleteMany({ where: { userId, token: { not: currentToken } } }),
    ]);
    return reply.send({ ok: true });
  });

  app.delete("/auth/account", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const userId = await userIdFromRequest(prisma, request);
    if (userId === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true, memberships: { select: { organizationId: true } } },
    });
    if (user === null) {
      return reply.code(401).send({ error: "Login required" });
    }

    // Confirm it is really the owner: the password, or for Google-only accounts, the email typed out.
    const body = (request.body as { password?: unknown; confirmEmail?: unknown } | undefined) ?? {};
    const confirmed = user.passwordHash
      ? typeof body.password === "string" && (await checkPassword(body.password, user.passwordHash))
      : typeof body.confirmEmail === "string" && body.confirmEmail.trim().toLowerCase() === user.email;
    if (!confirmed) {
      return reply.code(403).send({ error: "Account deletion not confirmed" });
    }

    const organizationIds = user.memberships.map((membership) => membership.organizationId);
    const memberCounts = await prisma.membership.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: organizationIds } },
      _count: { _all: true },
    });
    const soleOwned = memberCounts.filter((row) => row._count._all === 1).map((row) => row.organizationId);

    const files = await prisma.invoice.findMany({
      where: { organizationId: { in: soleOwned }, storageKey: { not: "" } },
      select: { storageKey: true },
    });
    await prisma.$transaction([
      prisma.organization.deleteMany({ where: { id: { in: soleOwned } } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);
    // Database rows are gone at this point; a file that fails to delete is logged, not fatal.
    for (const file of files) {
      await deleteStoredFile(file.storageKey).catch((error: unknown) => {
        request.log.warn({ err: error, key: file.storageKey }, "could not delete a stored file during account deletion");
      });
    }

    reply.clearCookie(SESSION_COOKIE, sessionCookieAttributes(cookie));
    return reply.send({ ok: true, deletedOrganizations: soleOwned.length });
  });
}
