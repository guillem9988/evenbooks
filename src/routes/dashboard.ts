import type { FastifyInstance } from "fastify";
import { InvoiceStatus, MatchStatus, type PrismaClient } from "../../generated/prisma/client.js";
import { parseExportRange } from "../reports/accountant-export.js";
import { enumToRate, groupByRate, type TaxPercent } from "../billing/lines.js";
import { cents, findOrganization, readUuid } from "./org-params.js";

export function registerDashboardRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/organizations/:organizationId/dashboard", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const query = request.query as { from?: string; to?: string };
    const range = parseExportRange(query.from, query.to);
    if (typeof range === "string") {
      return reply.code(400).send({ error: range });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    const [issued, received, unmatched] = await Promise.all([
      prisma.issuedInvoice.findMany({
        where: { organizationId, invoiceDate: { gte: from, lte: to } },
      }),
      prisma.invoice.findMany({
        where: { organizationId, status: InvoiceStatus.PARSED, invoiceDate: { gte: from, lte: to } },
      }),
      prisma.bankTransaction.count({
        where: {
          organizationId,
          matchStatus: MatchStatus.UNMATCHED,
          transactionDate: { gte: from, lte: to },
        },
      }),
    ]);
    const income = issued.reduce((total, row) => total + row.totalAmountCents, 0n);
    const expense = received.reduce((total, row) => total + (row.totalAmountCents ?? 0n), 0n);
    const outputVat = issued.reduce((total, row) => total + row.taxAmountCents, 0n);
    const inputVat = received.reduce((total, row) => total + (row.taxAmountCents ?? 0n), 0n);
    return reply.send({
      from: range.from,
      to: range.to,
      incomeCents: cents(income),
      expenseCents: cents(expense),
      profitCents: cents(income - expense),
      ivaRepercutitCents: cents(outputVat),
      ivaSuportatCents: cents(inputVat),
      unmatchedBankLines: unmatched,
    });
  });

  app.get("/organizations/:organizationId/taxes/preview", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const query = request.query as { from?: string; to?: string };
    const range = parseExportRange(query.from, query.to);
    if (typeof range === "string") {
      return reply.code(400).send({ error: range });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    const [issuedLines, received] = await Promise.all([
      prisma.issuedInvoiceLine.findMany({
        where: { issuedInvoice: { organizationId, invoiceDate: { gte: from, lte: to } } },
      }),
      prisma.invoice.findMany({
        where: { organizationId, status: InvoiceStatus.PARSED, invoiceDate: { gte: from, lte: to } },
      }),
    ]);
    const issued = groupByRate(
      issuedLines.flatMap((line) => {
        const rate = enumToRate(line.taxRate);
        return rate === null ? [] : [{ rate, baseCents: line.baseAmountCents, taxCents: line.taxAmountCents }];
      }),
    );
    const receivedBuckets = groupByRate(
      received.flatMap((row) => {
        const rate = enumToRate(row.taxRate);
        if (rate === null || row.baseAmountCents === null || row.taxAmountCents === null) {
          return [];
        }
        return [{ rate, baseCents: row.baseAmountCents, taxCents: row.taxAmountCents }];
      }),
    );
    return reply.send({
      kind: "modelo-303-preview",
      disclaimer: "Preview only. This is not an AEAT filing.",
      from: range.from,
      to: range.to,
      issued: issued.map(presentBucket),
      received: receivedBuckets.map(presentBucket),
    });
  });
}

function presentBucket(bucket: { rate: TaxPercent; baseCents: bigint; taxCents: bigint }) {
  return { rate: bucket.rate, baseCents: cents(bucket.baseCents), taxCents: cents(bucket.taxCents) };
}
