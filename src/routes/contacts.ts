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

  app.patch("/organizations/:organizationId/contacts/:contactId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const contactId = readUuid((request.params as { contactId?: string }).contactId, "contactId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (contactId instanceof Error) {
      return reply.code(400).send({ error: contactId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
    });
    if (contact === null) {
      return reply.code(404).send({ error: "Contact not found" });
    }

    const body = request.body as { legalName?: unknown; taxId?: unknown; email?: unknown; role?: unknown };
    const data: { legalName?: string; taxId?: string; email?: string; role?: ContactRole } = {};

    if (typeof body?.legalName === "string" && body.legalName.trim() !== "") {
      data.legalName = body.legalName.trim().slice(0, 255);
    }
    if (typeof body?.taxId === "string" && body.taxId.trim() !== "") {
      data.taxId = body.taxId.trim().toUpperCase().slice(0, 50);
    }
    if (typeof body?.email === "string" && body.email.trim() !== "") {
      data.email = body.email.trim().slice(0, 255);
    }
    if (body?.role === ContactRole.CLIENT || body?.role === ContactRole.SUPPLIER) {
      data.role = body.role;
    }

    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data,
    });

    return reply.send({
      id: updated.id,
      legalName: updated.legalName,
      taxId: updated.taxId,
      email: updated.email,
      role: updated.role,
    });
  });

  app.delete("/organizations/:organizationId/contacts/:contactId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const contactId = readUuid((request.params as { contactId?: string }).contactId, "contactId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (contactId instanceof Error) {
      return reply.code(400).send({ error: contactId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      include: {
        _count: {
          select: {
            issuedInvoices: true,
            quotes: true,
            recurringInvoices: true,
          },
        },
      },
    });
    if (contact === null) {
      return reply.code(404).send({ error: "Contact not found" });
    }

    const count = contact._count.issuedInvoices + contact._count.quotes + contact._count.recurringInvoices;
    if (count > 0) {
      return reply.code(409).send({ error: "Cannot delete contact with existing invoices or quotes" });
    }

    await prisma.contact.delete({
      where: { id: contact.id },
    });

    return reply.send({ ok: true, id: contact.id });
  });
}
