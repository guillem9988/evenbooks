import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { IssuedInvoiceStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { renderIssuedInvoicePdf } from "../billing/invoice-pdf.js";
import { sendEmail } from "../lib/mailer.js";
import { formatEuroDisplay } from "../lib/money.js";
import { cents, day, findOrganization, parseDay, readUuid } from "./org-params.js";
import { readLines } from "./document-lines.js";

const issuedInclude = {
  contact: true,
  lines: true,
  rectifies: { select: { seriesNumber: true } },
} as const;

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
      include: issuedInclude,
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
        include: issuedInclude,
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
      include: issuedInclude,
    });
    return reply.send(presentIssued(updated));
  });

  app.get("/organizations/:organizationId/issued-invoices/:invoiceId.pdf", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const invoiceId = readUuid((request.params as { invoiceId?: string }).invoiceId, "invoiceId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (invoiceId instanceof Error) {
      return reply.code(400).send({ error: invoiceId.message });
    }
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { legalName: true, taxId: true },
    });
    if (organization === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const invoice = await prisma.issuedInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: issuedInclude,
    });
    if (invoice === null) {
      return reply.code(404).send({ error: "Issued invoice not found" });
    }
    const pdf = await renderIssuedInvoicePdf({
      legalName: organization.legalName,
      taxId: organization.taxId,
      contactName: invoice.contact.legalName,
      contactTaxId: invoice.contact.taxId,
      seriesNumber: invoice.seriesNumber,
      invoiceDate: day(invoice.invoiceDate) ?? "",
      rectifiesSeriesNumber: invoice.rectifies?.seriesNumber ?? null,
      baseAmountCents: invoice.baseAmountCents,
      taxAmountCents: invoice.taxAmountCents,
      totalAmountCents: invoice.totalAmountCents,
      lines: invoice.lines,
    });
    const filename = `${invoice.seriesNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(Buffer.from(pdf));
  });

  app.post("/organizations/:organizationId/issued-invoices/:invoiceId/send-email", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const invoiceId = readUuid((request.params as { invoiceId?: string }).invoiceId, "invoiceId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (invoiceId instanceof Error) {
      return reply.code(400).send({ error: invoiceId.message });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { legalName: true, taxId: true },
    });
    if (organization === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const invoice = await prisma.issuedInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: issuedInclude,
    });
    if (invoice === null) {
      return reply.code(404).send({ error: "Issued invoice not found" });
    }

    const body = (request.body as {
      recipientEmail?: unknown;
      subject?: unknown;
      message?: unknown;
    }) ?? {};

    const targetEmail =
      typeof body.recipientEmail === "string" && body.recipientEmail.trim() !== ""
        ? body.recipientEmail.trim()
        : invoice.contact.email?.trim();

    if (!targetEmail || !targetEmail.includes("@")) {
      return reply.code(400).send({ error: "El client no té cap adreça de correu electrònic vàlida." });
    }

    const pdf = await renderIssuedInvoicePdf({
      legalName: organization.legalName,
      taxId: organization.taxId,
      contactName: invoice.contact.legalName,
      contactTaxId: invoice.contact.taxId,
      seriesNumber: invoice.seriesNumber,
      invoiceDate: day(invoice.invoiceDate) ?? "",
      rectifiesSeriesNumber: invoice.rectifies?.seriesNumber ?? null,
      baseAmountCents: invoice.baseAmountCents,
      taxAmountCents: invoice.taxAmountCents,
      totalAmountCents: invoice.totalAmountCents,
      lines: invoice.lines,
    });

    const filename = `${invoice.seriesNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
    const subject =
      typeof body.subject === "string" && body.subject.trim() !== ""
        ? body.subject.trim()
        : `Factura ${invoice.seriesNumber} - ${organization.legalName}`;

    const defaultBody = [
      `Benvolgut/da ${invoice.contact.legalName},`,
      "",
      `Us adjuntem en format PDF la factura número ${invoice.seriesNumber} amb data ${day(invoice.invoiceDate) ?? ""} per un import total de ${formatEuroDisplay(invoice.totalAmountCents)}.`,
      "",
      "Gràcies per la vostra confiança.",
      "",
      `Atentament,`,
      organization.legalName,
    ].join("\n");

    const message =
      typeof body.message === "string" && body.message.trim() !== ""
        ? body.message.trim()
        : defaultBody;

    try {
      const emailResult = await sendEmail({
        to: targetEmail,
        subject,
        text: message,
        attachments: [
          {
            filename,
            content: Buffer.from(pdf),
            contentType: "application/pdf",
          },
        ],
      });

      return reply.send({
        ok: true,
        simulated: emailResult.simulated ?? false,
        recipient: targetEmail,
        message: emailResult.simulated
          ? "Correu simulat amb èxit (mode desenvolupament sense RESEND_API_KEY)."
          : "Factura enviada correctament per correu electrònic.",
      });
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Error enviant la factura per correu.";
      return reply.code(500).send({ error: msg });
    }
  });

  app.post("/organizations/:organizationId/issued-invoices/:invoiceId/rectify", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const invoiceId = readUuid((request.params as { invoiceId?: string }).invoiceId, "invoiceId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (invoiceId instanceof Error) {
      return reply.code(400).send({ error: invoiceId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const original = await prisma.issuedInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { lines: true, creditNote: { select: { id: true } } },
    });
    if (original === null) {
      return reply.code(404).send({ error: "Issued invoice not found" });
    }
    if (original.rectifiesIssuedInvoiceId !== null) {
      return reply.code(400).send({ error: "Cannot rectify a credit note" });
    }
    if (original.creditNote !== null) {
      return reply.code(409).send({ error: "Invoice is already rectified" });
    }
    const seriesNumber = await creditSeries(prisma, organizationId, original.seriesNumber);
    const today = new Date();
    const invoiceDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    try {
      const created = await prisma.issuedInvoice.create({
        data: {
          organization: { connect: { id: organizationId } },
          contact: { connect: { id: original.contactId } },
          rectifies: { connect: { id: original.id } },
          seriesNumber,
          invoiceDate,
          baseAmountCents: -original.baseAmountCents,
          taxAmountCents: -original.taxAmountCents,
          totalAmountCents: -original.totalAmountCents,
          lines: {
            create: original.lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitAmountCents: -line.unitAmountCents,
              taxRate: line.taxRate,
              baseAmountCents: -line.baseAmountCents,
              taxAmountCents: -line.taxAmountCents,
              totalAmountCents: -line.totalAmountCents,
            })),
          },
        },
        include: issuedInclude,
      });
      return reply.code(201).send(presentIssued(created));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = String(error.meta?.target ?? "");
        if (target.includes("rectifies")) {
          return reply.code(409).send({ error: "Invoice is already rectified" });
        }
        return reply.code(409).send({ error: "Series number already exists" });
      }
      throw error;
    }
  });

  app.delete("/organizations/:organizationId/issued-invoices/:invoiceId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const invoiceId = readUuid((request.params as { invoiceId?: string }).invoiceId, "invoiceId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (invoiceId instanceof Error) {
      return reply.code(400).send({ error: invoiceId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const invoice = await prisma.issuedInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        creditNote: { select: { id: true, seriesNumber: true } },
        reconciliation: { select: { id: true, transactionId: true } },
        quote: { select: { id: true } },
      },
    });
    if (invoice === null) {
      return reply.code(404).send({ error: "Issued invoice not found" });
    }
    if (invoice.creditNote !== null) {
      return reply.code(409).send({ error: "Cannot delete an invoice that has been rectified" });
    }

    await prisma.$transaction(async (tx) => {
      if (invoice.reconciliation) {
        await tx.bankTransaction.update({
          where: { id: invoice.reconciliation.transactionId },
          data: { matchStatus: "UNMATCHED" },
        });
        await tx.reconciliationMatch.delete({
          where: { id: invoice.reconciliation.id },
        });
      }

      if (invoice.quote) {
        await tx.quote.update({
          where: { id: invoice.quote.id },
          data: { status: "OPEN", issuedInvoiceId: null },
        });
      }

      await tx.issuedInvoice.delete({
        where: { id: invoice.id },
      });
    }, { timeout: 15000 });

    return reply.send({ ok: true, id: invoice.id });
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
  rectifiesIssuedInvoiceId?: string | null;
  rectifies?: { seriesNumber: string } | null;
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
    rectifiesIssuedInvoiceId: row.rectifiesIssuedInvoiceId ?? null,
    rectifiesSeriesNumber: row.rectifies?.seriesNumber ?? null,
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

async function creditSeries(prisma: PrismaClient, organizationId: string, seriesNumber: string): Promise<string> {
  const preferred = `${seriesNumber}-R`.slice(0, 100);
  const taken = await prisma.issuedInvoice.findFirst({
    where: { organizationId, seriesNumber: preferred },
    select: { id: true },
  });
  if (taken === null) {
    return preferred;
  }
  const short = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${seriesNumber}-R-${short}`.slice(0, 100);
}
