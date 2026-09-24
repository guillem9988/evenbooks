import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";

export function registerOrganizationRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.post("/organizations", async (request, reply) => {
    const body = request.body as { legalName?: unknown; taxId?: unknown };
    if (typeof body?.legalName !== "string" || body.legalName.trim() === "") {
      return reply.code(400).send({ error: "legalName is required" });
    }
    if (typeof body.taxId !== "string" || body.taxId.trim() === "") {
      return reply.code(400).send({ error: "taxId is required" });
    }
    const organization = await prisma.organization.create({
      data: { legalName: body.legalName.trim().slice(0, 255), taxId: body.taxId.trim().slice(0, 50) },
      select: { id: true, legalName: true, taxId: true },
    });
    return reply.code(201).send(organization);
  });
}
