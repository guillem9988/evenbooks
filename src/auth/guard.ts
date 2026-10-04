import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { userIdFromRequest } from "./session.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerOrganizationGuard(app: FastifyInstance, prisma: PrismaClient): void {
  app.addHook("preHandler", async (request, reply) => {
    // Decide from what the router matched, never from the raw URL: the router percent-decodes the
    // path, so "/%6Frganizations/<id>" or an encoded id would otherwise reach a handler unchecked.
    const route = request.routeOptions.url ?? "";
    if (!route.startsWith("/organizations")) {
      return;
    }
    const userId = await userIdFromRequest(prisma, request);
    if (userId === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    request.userId = userId;
    const organizationId = (request.params as { organizationId?: string } | undefined)?.organizationId;
    if (organizationId === undefined) {
      return;
    }
    if (!UUID.test(organizationId)) {
      return reply.code(400).send({ error: "organizationId must be a UUID" });
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
