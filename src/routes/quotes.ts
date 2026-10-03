import type { FastifyInstance } from "fastify";
import { Prisma, QuoteStatus, type PrismaClient } from "../../generated/prisma/client.js";
import { cents, day, findOrganization, parseDay, readUuid } from "./org-params.js";
import { renderQuotePdf } from "../billing/invoice-pdf.js";
import { readLines } from "./document-lines.js";
import { presentIssued } from "./issued-invoices.js";

export function registerQuoteRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/organizations/:organizationId/quotes", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const rows = await prisma.quote.findMany({
      where: { organizationId },
      include: { contact: true, lines: true },
      orderBy: { quoteDate: "desc" },
    });
    return reply.send({ quotes: rows.map(presentQuote) });
  });

  app.post("/organizations/:organizationId/quotes", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const body = request.body as {
      contactId?: unknown;
      quoteDate?: unknown;
      seriesNumber?: unknown;
      lines?: unknown;
    };
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    if (typeof body?.contactId !== "string") {
      return reply.code(400).send({ error: "contactId must be a UUID" });
    }
    const contactId = readUuid(body.contactId, "contactId");
    if (contactId instanceof Error) {
      return reply.code(400).send({ error: contactId.message });
    }
    const quoteDate = parseDay(body.quoteDate);
    if (quoteDate === null) {
      return reply.code(400).send({ error: "quoteDate must be YYYY-MM-DD" });
    }
    if (typeof body.seriesNumber !== "string" || body.seriesNumber.trim() === "") {
      return reply.code(400).send({ error: "seriesNumber is required" });
    }
    const document = readLines(body.lines);
    if (document instanceof Error) {
      return reply.code(400).send({ error: document.message });
    }
    const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId } });
    if (contact === null) {
      return reply.code(404).send({ error: "Contact not found" });
    }
    try {
      const created = await prisma.quote.create({
        data: {
          organizationId,
          contactId,
          seriesNumber: body.seriesNumber.trim().slice(0, 100),
          quoteDate,
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
        include: { contact: true, lines: true },
      });
      return reply.code(201).send(presentQuote(created));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "Series number already exists" });
      }
      throw error;
    }
  });

  app.post("/organizations/:organizationId/quotes/:quoteId/convert", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const quoteId = readUuid((request.params as { quoteId?: string }).quoteId, "quoteId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (quoteId instanceof Error) {
      return reply.code(400).send({ error: quoteId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: { lines: true },
    });
    if (quote === null) {
      return reply.code(404).send({ error: "Quote not found" });
    }
    if (quote.status === QuoteStatus.CONVERTED || quote.issuedInvoiceId !== null) {
      return reply.code(409).send({ error: "Quote is already converted" });
    }
    const seriesNumber =
      typeof (request.body as { seriesNumber?: unknown } | null)?.seriesNumber === "string"
        ? (request.body as { seriesNumber: string }).seriesNumber.trim().slice(0, 100)
        : quote.seriesNumber;
    if (seriesNumber === "") {
      return reply.code(400).send({ error: "seriesNumber is required" });
    }
    try {
      const issued = await prisma.$transaction(async (tx) => {
        const claimed = await tx.quote.updateMany({
          where: { id: quote.id, status: QuoteStatus.OPEN, issuedInvoiceId: null },
          data: { status: QuoteStatus.CONVERTED },
        });
        if (claimed.count !== 1) {
          throw new AlreadyConverted();
        }
        const created = await tx.issuedInvoice.create({
          data: {
            organizationId,
            contactId: quote.contactId,
            seriesNumber,
            invoiceDate: quote.quoteDate,
            baseAmountCents: quote.baseAmountCents,
            taxAmountCents: quote.taxAmountCents,
            totalAmountCents: quote.totalAmountCents,
            lines: {
              create: quote.lines.map((line) => ({
                description: line.description,
                quantity: line.quantity,
                unitAmountCents: line.unitAmountCents,
                taxRate: line.taxRate,
                baseAmountCents: line.baseAmountCents,
                taxAmountCents: line.taxAmountCents,
                totalAmountCents: line.totalAmountCents,
              })),
            },
          },
          include: { contact: true, lines: true },
        });
        await tx.quote.update({ where: { id: quote.id }, data: { issuedInvoiceId: created.id } });
        return created;
      });
      return reply.code(201).send(presentIssued(issued));
    } catch (error) {
      if (error instanceof AlreadyConverted) {
        return reply.code(409).send({ error: "Quote is already converted" });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await prisma.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.OPEN } }).catch(() => undefined);
        return reply.code(409).send({ error: "Series number already exists" });
      }
      throw error;
    }
  });

  app.get("/organizations/:organizationId/quotes/:quoteId.pdf", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const quoteId = readUuid((request.params as { quoteId?: string }).quoteId, "quoteId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (quoteId instanceof Error) {
      return reply.code(400).send({ error: quoteId.message });
    }
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { legalName: true, taxId: true },
    });
    if (organization === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: { contact: true, lines: true },
    });
    if (quote === null) {
      return reply.code(404).send({ error: "Quote not found" });
    }
    const pdf = await renderQuotePdf({
      legalName: organization.legalName,
      taxId: organization.taxId,
      contactName: quote.contact.legalName,
      contactTaxId: quote.contact.taxId,
      seriesNumber: quote.seriesNumber,
      invoiceDate: day(quote.quoteDate) ?? "",
      baseAmountCents: quote.baseAmountCents,
      taxAmountCents: quote.taxAmountCents,
      totalAmountCents: quote.totalAmountCents,
      lines: quote.lines,
    });
    const filename = `${quote.seriesNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(Buffer.from(pdf));
  });

  app.patch("/organizations/:organizationId/quotes/:quoteId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const quoteId = readUuid((request.params as { quoteId?: string }).quoteId, "quoteId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (quoteId instanceof Error) {
      return reply.code(400).send({ error: quoteId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: { lines: true },
    });
    if (quote === null) {
      return reply.code(404).send({ error: "Quote not found" });
    }
    if (quote.status === QuoteStatus.CONVERTED || quote.issuedInvoiceId !== null) {
      return reply.code(409).send({ error: "Cannot edit a converted quote" });
    }

    const body = request.body as {
      contactId?: unknown;
      quoteDate?: unknown;
      seriesNumber?: unknown;
      lines?: unknown;
    };

    let newContactId: string | undefined = undefined;
    if (body?.contactId !== undefined) {
      if (typeof body.contactId !== "string") return reply.code(400).send({ error: "contactId must be a UUID" });
      const cid = readUuid(body.contactId, "contactId");
      if (cid instanceof Error) return reply.code(400).send({ error: cid.message });
      const contact = await prisma.contact.findFirst({ where: { id: cid, organizationId } });
      if (contact === null) return reply.code(404).send({ error: "Contact not found" });
      newContactId = cid;
    }

    let newQuoteDate: Date | undefined = undefined;
    if (body?.quoteDate !== undefined) {
      const d = parseDay(body.quoteDate);
      if (d === null) return reply.code(400).send({ error: "quoteDate must be YYYY-MM-DD" });
      newQuoteDate = d;
    }

    let newSeries: string | undefined = undefined;
    if (body?.seriesNumber !== undefined) {
      if (typeof body.seriesNumber !== "string" || body.seriesNumber.trim() === "") {
        return reply.code(400).send({ error: "seriesNumber is required" });
      }
      newSeries = body.seriesNumber.trim().slice(0, 100);
    }

    let document = undefined;
    if (body?.lines !== undefined) {
      const doc = readLines(body.lines);
      if (doc instanceof Error) return reply.code(400).send({ error: doc.message });
      document = doc;
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        if (document !== undefined) {
          await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });
          await tx.quoteLine.createMany({
            data: document.lines.map((line) => ({
              quoteId: quote.id,
              description: line.description,
              quantity: line.quantity,
              unitAmountCents: line.unitAmountCents,
              taxRate: line.taxRateType,
              baseAmountCents: line.baseAmountCents,
              taxAmountCents: line.taxAmountCents,
              totalAmountCents: line.totalAmountCents,
            })),
          });
        }
        return tx.quote.update({
          where: { id: quote.id },
          data: {
            ...(newContactId !== undefined ? { contactId: newContactId } : {}),
            ...(newQuoteDate !== undefined ? { quoteDate: newQuoteDate } : {}),
            ...(newSeries !== undefined ? { seriesNumber: newSeries } : {}),
            ...(document !== undefined
              ? {
                  baseAmountCents: document.baseAmountCents,
                  taxAmountCents: document.taxAmountCents,
                  totalAmountCents: document.totalAmountCents,
                }
              : {}),
          },
          include: { contact: true, lines: true },
        });
      }, { timeout: 15000 });
      return reply.send(presentQuote(updated));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "Series number already exists" });
      }
      throw error;
    }
  });

  app.delete("/organizations/:organizationId/quotes/:quoteId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const quoteId = readUuid((request.params as { quoteId?: string }).quoteId, "quoteId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (quoteId instanceof Error) {
      return reply.code(400).send({ error: quoteId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
    });
    if (quote === null) {
      return reply.code(404).send({ error: "Quote not found" });
    }
    if (quote.status === QuoteStatus.CONVERTED || quote.issuedInvoiceId !== null) {
      return reply.code(409).send({ error: "Cannot delete a converted quote" });
    }
    await prisma.quote.delete({
      where: { id: quote.id },
    });
    return reply.send({ ok: true, id: quote.id });
  });
}

class AlreadyConverted extends Error {}

function presentQuote(row: {
  id: string;
  seriesNumber: string;
  quoteDate: Date;
  status: QuoteStatus;
  baseAmountCents: bigint;
  taxAmountCents: bigint;
  totalAmountCents: bigint;
  issuedInvoiceId: string | null;
  contact: { id: string; legalName: string };
  lines: Array<{ description: string; quantity: number; unitAmountCents: bigint; taxRate: string; totalAmountCents: bigint }>;
}) {
  return {
    id: row.id,
    contactId: row.contact.id,
    contactName: row.contact.legalName,
    seriesNumber: row.seriesNumber,
    quoteDate: day(row.quoteDate),
    status: row.status,
    issuedInvoiceId: row.issuedInvoiceId,
    baseAmountCents: cents(row.baseAmountCents),
    taxAmountCents: cents(row.taxAmountCents),
    totalAmountCents: cents(row.totalAmountCents),
    lines: row.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitAmountCents: cents(line.unitAmountCents),
      taxRate: line.taxRate,
      totalAmountCents: cents(line.totalAmountCents),
    })),
  };
}
