import type { FastifyInstance } from "fastify";
import { ContactRole, type PrismaClient } from "../../generated/prisma/client.js";
import { findOrganization, readUuid } from "./org-params.js";

export function registerContactRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/organizations/:organizationId/contacts", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const contacts = await prisma.contact.findMany({
      where: { organizationId },
      orderBy: { legalName: "asc" },
    });
    return reply.send({
      contacts: contacts.map((contact) => ({
        id: contact.id,
        legalName: contact.legalName,
        taxId: contact.taxId,
        email: contact.email,
        role: contact.role,
      })),
    });
  });

  app.post("/organizations/:organizationId/contacts", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const body = request.body as { legalName?: unknown; taxId?: unknown; email?: unknown; role?: unknown };
    if (typeof body?.legalName !== "string" || body.legalName.trim() === "") {
      return reply.code(400).send({ error: "legalName is required" });
    }
    if (typeof body.taxId !== "string" || body.taxId.trim() === "") {
      return reply.code(400).send({ error: "taxId is required" });
    }
    if (typeof body.email !== "string" || body.email.trim() === "") {
      return reply.code(400).send({ error: "email is required" });
    }
    if (body.role !== ContactRole.CLIENT && body.role !== ContactRole.SUPPLIER) {
      return reply.code(400).send({ error: "role must be CLIENT or SUPPLIER" });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        legalName: body.legalName.trim().slice(0, 255),
        taxId: body.taxId.trim().slice(0, 50),
        email: body.email.trim().slice(0, 255),
        role: body.role,
      },
    });
    return reply.code(201).send({
      id: contact.id,
      legalName: contact.legalName,
      taxId: contact.taxId,
      email: contact.email,
      role: contact.role,
    });
  });
}
