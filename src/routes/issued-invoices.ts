import type { FastifyInstance } from "fastify";
import { IssuedInvoiceStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { cents, day, findOrganization, parseDay, readUuid } from "./org-params.js";
import { readLines } from "./document-lines.js";

export function registerIssuedInvoiceRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/organizations/:organizationId/issued-invoices", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const rows = await prisma.issuedInvoice.findMany({
      where: { organizationId },
      include: { contact: true, lines: true },
      orderBy: { invoiceDate: "desc" },
    });
    return reply.send({ issuedInvoices: rows.map(presentIssued) });
  });

  app.post("/organizations/:organizationId/issued-invoices", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const body = request.body as {
      contactId?: unknown;
      invoiceDate?: unknown;
      seriesNumber?: unknown;
      lines?: unknown;
    };
    const built = await buildIssued(prisma, organizationId, body);
    if (built instanceof Error) {
      const status = built.message === "Organization not found" || built.message === "Contact not found" ? 404 : 400;
      return reply.code(status).send({ error: built.message });
    }
    try {
      const created = await prisma.issuedInvoice.create({
        data: built,
        include: { contact: true, lines: true },
      });
      return reply.code(201).send(presentIssued(created));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "Series number already exists" });
      }
      throw error;
    }
  });

  app.patch("/organizations/:organizationId/issued-invoices/:invoiceId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const invoiceId = readUuid((request.params as { invoiceId?: string }).invoiceId, "invoiceId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (invoiceId instanceof Error) {
      return reply.code(400).send({ error: invoiceId.message });
    }
    const paid = (request.body as { paid?: unknown })?.paid;
    if (typeof paid !== "boolean") {
      return reply.code(400).send({ error: "paid must be true or false" });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const existing = await prisma.issuedInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (existing === null) {
      return reply.code(404).send({ error: "Issued invoice not found" });
    }
    const updated = await prisma.issuedInvoice.update({
      where: { id: existing.id },
      data: { status: paid ? IssuedInvoiceStatus.PAID : IssuedInvoiceStatus.UNPAID },
      include: { contact: true, lines: true },
    });
    return reply.send(presentIssued(updated));
  });
}

export async function buildIssued(
  prisma: PrismaClient,
  organizationId: string,
  body: { contactId?: unknown; invoiceDate?: unknown; seriesNumber?: unknown; lines?: unknown },
): Promise<Prisma.IssuedInvoiceCreateInput | Error> {
  if ((await findOrganization(prisma, organizationId)) === null) {
    return new Error("Organization not found");
  }
  if (typeof body.contactId !== "string") {
    return new Error("contactId must be a UUID");
  }
  const contactId = readUuid(body.contactId, "contactId");
  if (contactId instanceof Error) {
    return contactId;
  }
  const invoiceDate = parseDay(body.invoiceDate);
  if (invoiceDate === null) {
    return new Error("invoiceDate must be YYYY-MM-DD");
  }
  if (typeof body.seriesNumber !== "string" || body.seriesNumber.trim() === "") {
    return new Error("seriesNumber is required");
  }
  const document = readLines(body.lines);
  if (document instanceof Error) {
    return document;
  }
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId } });
  if (contact === null) {
    return new Error("Contact not found");
  }
  return {
    organization: { connect: { id: organizationId } },
    contact: { connect: { id: contactId } },
    seriesNumber: body.seriesNumber.trim().slice(0, 100),
    invoiceDate,
    baseAmountCents: document.baseAmountCents,
    taxAmountCents: document.taxAmountCents,
    totalAmountCents: document.totalAmountCents,
    lines: {
      create: document.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitAmountCents: line.unitAmountCents,
        taxRate: line.taxRateType,
        baseAmountCents: line.baseAmountCents,
        taxAmountCents: line.taxAmountCents,
        totalAmountCents: line.totalAmountCents,
      })),
    },
  };
}

export function presentIssued(row: {
  id: string;
  seriesNumber: string;
  invoiceDate: Date;
  status: IssuedInvoiceStatus;
  baseAmountCents: bigint;
  taxAmountCents: bigint;
  totalAmountCents: bigint;
  contact: { id: string; legalName: string; taxId: string };
  lines: Array<{
    description: string;
    quantity: number;
    unitAmountCents: bigint;
    taxRate: string;
    baseAmountCents: bigint;
    taxAmountCents: bigint;
    totalAmountCents: bigint;
  }>;
}) {
  return {
    id: row.id,
    contactId: row.contact.id,
    contactName: row.contact.legalName,
    contactTaxId: row.contact.taxId,
    seriesNumber: row.seriesNumber,
    invoiceDate: day(row.invoiceDate),
    status: row.status,
    baseAmountCents: cents(row.baseAmountCents),
    taxAmountCents: cents(row.taxAmountCents),
    totalAmountCents: cents(row.totalAmountCents),
    lines: row.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitAmountCents: cents(line.unitAmountCents),
      taxRate: line.taxRate,
      baseAmountCents: cents(line.baseAmountCents),
      taxAmountCents: cents(line.taxAmountCents),
      totalAmountCents: cents(line.totalAmountCents),
    })),
  };
}
