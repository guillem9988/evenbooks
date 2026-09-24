import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { reconcileOrganization } from "../matching/reconcile.js";

const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerReconcileRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.post("/organizations/:organizationId/reconcile", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    if (!ORGANIZATION_ID.test(organizationId)) {
      return reply.code(400).send({ error: "organizationId must be a UUID" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (organization === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const result = await reconcileOrganization(prisma, organizationId);
    return reply.code(200).send({
      confirmed: result.confirmed,
      suggestions: result.suggestions,
    });
  });
}
