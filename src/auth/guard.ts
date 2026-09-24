import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { userIdFromRequest } from "./session.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerOrganizationGuard(app: FastifyInstance, prisma: PrismaClient): void {
  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    if (!path.startsWith("/organizations")) {
      return;
    }
    const userId = await userIdFromRequest(prisma, request);
    if (userId === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    request.userId = userId;
    const match = /^\/organizations\/([^/]+)/.exec(path);
    const organizationId = match?.[1];
    if (organizationId === undefined || !UUID.test(organizationId)) {
      return;
    }
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (organization === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (membership === null) {
      return reply.code(403).send({ error: "Not a member of this organization" });
    }
  });
}
