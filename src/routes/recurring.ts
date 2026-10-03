import type { FastifyInstance } from "fastify";
import type { PrismaClient, TaxRateType } from "../../generated/prisma/client.js";
import { computeDocument, enumToRate } from "../billing/lines.js";
import { readLines } from "./document-lines.js";
import { cents, day, findOrganization, readUuid } from "./org-params.js";

export function registerRecurringRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/organizations/:organizationId/recurring-invoices", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const rows = await prisma.recurringInvoice.findMany({
      where: { organizationId },
      include: { contact: true, lines: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ recurringInvoices: rows.map(presentSeries) });
  });

  app.post("/organizations/:organizationId/recurring-invoices", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const body = request.body as { contactId?: unknown; dayOfMonth?: unknown; lines?: unknown };
    const dayOfMonth = readDay(body?.dayOfMonth);
    if (dayOfMonth instanceof Error) {
      return reply.code(400).send({ error: dayOfMonth.message });
    }
    if (typeof body.contactId !== "string") {
      return reply.code(400).send({ error: "contactId must be a UUID" });
    }
    const contactId = readUuid(body.contactId, "contactId");
    if (contactId instanceof Error) {
      return reply.code(400).send({ error: contactId.message });
    }
    const document = readLines(body.lines);
    if (document instanceof Error) {
      return reply.code(400).send({ error: document.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId } });
    if (contact === null) {
      return reply.code(404).send({ error: "Contact not found" });
    }
    const created = await prisma.recurringInvoice.create({
      data: {
        organizationId,
        contactId,
        dayOfMonth,
        lines: {
          create: document.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitAmountCents: line.unitAmountCents,
            taxRate: line.taxRateType,
          })),
        },
      },
      include: { contact: true, lines: true },
    });
    return reply.code(201).send(presentSeries(created));
  });

  app.post("/organizations/:organizationId/recurring-invoices/:seriesId/pause", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const seriesId = readUuid((request.params as { seriesId?: string }).seriesId, "seriesId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (seriesId instanceof Error) {
      return reply.code(400).send({ error: seriesId.message });
    }
    const existing = await prisma.recurringInvoice.findFirst({
      where: { id: seriesId, organizationId },
      include: { contact: true, lines: true },
    });
    if (existing === null) {
      return reply.code(404).send({ error: "Recurring invoice not found" });
    }
    const updated = await prisma.recurringInvoice.update({
      where: { id: existing.id },
      data: { active: !existing.active },
      include: { contact: true, lines: true },
    });
    return reply.send(presentSeries(updated));
  });

  app.patch("/organizations/:organizationId/recurring-invoices/:seriesId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const seriesId = readUuid((request.params as { seriesId?: string }).seriesId, "seriesId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (seriesId instanceof Error) {
      return reply.code(400).send({ error: seriesId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const existing = await prisma.recurringInvoice.findFirst({
      where: { id: seriesId, organizationId },
      include: { contact: true, lines: true },
    });
    if (existing === null) {
      return reply.code(404).send({ error: "Recurring invoice not found" });
    }

    const body = request.body as { contactId?: unknown; dayOfMonth?: unknown; lines?: unknown };
    let newDayOfMonth: number | undefined = undefined;
    if (body?.dayOfMonth !== undefined) {
      const d = readDay(body.dayOfMonth);
      if (d instanceof Error) return reply.code(400).send({ error: d.message });
      newDayOfMonth = d;
    }

    let newContactId: string | undefined = undefined;
    if (body?.contactId !== undefined) {
      if (typeof body.contactId !== "string") return reply.code(400).send({ error: "contactId must be a UUID" });
      const cid = readUuid(body.contactId, "contactId");
      if (cid instanceof Error) return reply.code(400).send({ error: cid.message });
      const contact = await prisma.contact.findFirst({ where: { id: cid, organizationId } });
      if (contact === null) return reply.code(404).send({ error: "Contact not found" });
      newContactId = cid;
    }

    let parsedLines = undefined;
    if (body?.lines !== undefined) {
      const document = readLines(body.lines);
      if (document instanceof Error) return reply.code(400).send({ error: document.message });
      parsedLines = document.lines;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (parsedLines !== undefined) {
        await tx.recurringInvoiceLine.deleteMany({
          where: { recurringInvoiceId: existing.id },
        });
        await tx.recurringInvoiceLine.createMany({
          data: parsedLines.map((line) => ({
            recurringInvoiceId: existing.id,
            description: line.description,
            quantity: line.quantity,
            unitAmountCents: line.unitAmountCents,
            taxRate: line.taxRateType,
          })),
        });
      }
      return tx.recurringInvoice.update({
        where: { id: existing.id },
        data: {
          ...(newDayOfMonth !== undefined ? { dayOfMonth: newDayOfMonth } : {}),
          ...(newContactId !== undefined ? { contactId: newContactId } : {}),
        },
        include: { contact: true, lines: true },
      });
    }, { timeout: 15000 });

    return reply.send(presentSeries(updated));
  });

  app.delete("/organizations/:organizationId/recurring-invoices/:seriesId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const seriesId = readUuid((request.params as { seriesId?: string }).seriesId, "seriesId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (seriesId instanceof Error) {
      return reply.code(400).send({ error: seriesId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const existing = await prisma.recurringInvoice.findFirst({
      where: { id: seriesId, organizationId },
    });
    if (existing === null) {
      return reply.code(404).send({ error: "Recurring invoice not found" });
    }
    await prisma.recurringInvoice.delete({
      where: { id: existing.id },
    });
    return reply.send({ ok: true, id: existing.id });
  });

  app.post("/organizations/:organizationId/recurring-invoices/run", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const from = new Date(Date.UTC(year, month, 1));
    const to = new Date(Date.UTC(year, month + 1, 0));
    const series = await prisma.recurringInvoice.findMany({
      where: { organizationId, active: true },
      include: { lines: true },
    });
    const created = [];
    for (const row of series) {
      const invoice = await prisma.$transaction(async (tx) => {
        const already = await tx.issuedInvoice.findFirst({
          where: { recurringInvoiceId: row.id, invoiceDate: { gte: from, lte: to } },
        });
        if (already !== null) {
          return null;
        }
        const document = computeDocument(
          row.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitAmountCents: line.unitAmountCents,
            taxRate: enumToRate(line.taxRate) ?? 0,
          })),
        );
        const invoiceDate = new Date(Date.UTC(year, month, row.dayOfMonth));
        const seriesNumber = `R${year}${String(month + 1).padStart(2, "0")}-${row.id.slice(0, 8)}`;
        return tx.issuedInvoice.create({
          data: {
            organizationId,
            contactId: row.contactId,
            recurringInvoiceId: row.id,
            seriesNumber,
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
          },
        });
      });
      if (invoice !== null) {
        created.push({ id: invoice.id, seriesNumber: invoice.seriesNumber, invoiceDate: day(invoice.invoiceDate) });
      }
    }
    return reply.send({ created });
  });
}

function readDay(value: unknown): number | Error {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > 28) {
    return new Error("dayOfMonth must be an integer from 1 to 28");
  }
  return number;
}

function presentSeries(row: {
  id: string;
  contactId: string;
  dayOfMonth: number;
  active: boolean;
  contact: { legalName: string };
  lines: Array<{
    description: string;
    quantity: number;
    unitAmountCents: bigint;
    taxRate: TaxRateType;
  }>;
}) {
  return {
    id: row.id,
    contactId: row.contactId,
    contactName: row.contact.legalName,
    dayOfMonth: row.dayOfMonth,
    active: row.active,
    lines: row.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitAmountCents: cents(line.unitAmountCents),
      taxRate: enumToRate(line.taxRate),
    })),
  };
}
