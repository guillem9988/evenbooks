import type { FastifyInstance } from "fastify";
import { InvoiceStatus, MatchStatus, type PrismaClient } from "../../generated/prisma/client.js";
import { parseExportRange } from "../reports/accountant-export.js";
import { enumToRate, groupByRate, type TaxPercent } from "../billing/lines.js";
import { cumulativeModelo130, exactQuarter, previewModelo130, type QuarterAmounts } from "../billing/modelo-130.js";
import { monthlyTrend, netCents, trendWindow } from "../reports/trend.js";
import { cents, findOrganization, parseDay, readUuid } from "./org-params.js";

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
    const income = sumNet(issued);
    const expense = sumNet(received);
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

  app.get("/organizations/:organizationId/dashboard/trend", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const query = request.query as { months?: string; to?: string };
    const months = query.months === undefined ? 12 : Number(query.months);
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      return reply.code(400).send({ error: "months must be an integer from 1 to 36" });
    }
    const end = query.to === undefined ? new Date() : parseDay(query.to);
    if (end === null) {
      return reply.code(400).send({ error: "to must be a YYYY-MM-DD date" });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const { from, until } = trendWindow(end, months);
    const [issued, received] = await Promise.all([
      prisma.issuedInvoice.findMany({
        where: { organizationId, invoiceDate: { gte: from, lt: until } },
        select: { invoiceDate: true, baseAmountCents: true, taxAmountCents: true, totalAmountCents: true },
      }),
      prisma.invoice.findMany({
        where: { organizationId, status: InvoiceStatus.PARSED, invoiceDate: { gte: from, lt: until } },
        select: { invoiceDate: true, baseAmountCents: true, taxAmountCents: true, totalAmountCents: true },
      }),
    ]);
    const toRow = (row: { invoiceDate: Date | null; baseAmountCents: bigint | null; taxAmountCents: bigint | null; totalAmountCents: bigint | null }) => ({
      date: row.invoiceDate,
      baseCents: row.baseAmountCents,
      taxCents: row.taxAmountCents,
      totalCents: row.totalAmountCents,
    });
    const trend = monthlyTrend(issued.map(toRow), received.map(toRow), end, months);
    return reply.send({
      months: trend.map((row) => ({
        month: row.month,
        incomeCents: cents(row.incomeCents),
        expenseCents: cents(row.expenseCents),
      })),
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

  app.get("/organizations/:organizationId/taxes/130", async (request, reply) => {
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
    const [issued, received] = await Promise.all([
      prisma.issuedInvoice.findMany({
        where: { organizationId, invoiceDate: { gte: from, lte: to } },
      }),
      prisma.invoice.findMany({
        where: { organizationId, status: InvoiceStatus.PARSED, invoiceDate: { gte: from, lte: to } },
      }),
    ]);
    // Modelo 130 works on income and deductible expenses before VAT: IVA is neither income nor expense.
    const preview = previewModelo130(sumNet(issued), sumNet(received));
    // For a calendar quarter, also give the filing figure: accumulated since January, minus earlier payments.
    const quarter = exactQuarter(range.from, range.to);
    let cumulative = null;
    if (quarter !== null) {
      const yearStart = new Date(Date.UTC(quarter.year, 0, 1));
      const [issuedYtd, receivedYtd] = await Promise.all([
        prisma.issuedInvoice.findMany({
          where: { organizationId, invoiceDate: { gte: yearStart, lte: to } },
          select: { invoiceDate: true, baseAmountCents: true, taxAmountCents: true, totalAmountCents: true },
        }),
        prisma.invoice.findMany({
          where: { organizationId, status: InvoiceStatus.PARSED, invoiceDate: { gte: yearStart, lte: to } },
          select: { invoiceDate: true, baseAmountCents: true, taxAmountCents: true, totalAmountCents: true },
        }),
      ]);
      const quarters: QuarterAmounts[] = [1, 2, 3, 4].map(() => ({ incomeCents: 0n, expenseCents: 0n }));
      const quarterOf = (date: Date | null) => (date === null ? undefined : quarters[Math.floor(date.getUTCMonth() / 3)]);
      for (const row of issuedYtd) {
        const bucket = quarterOf(row.invoiceDate);
        if (bucket) bucket.incomeCents += sumNet([row]);
      }
      for (const row of receivedYtd) {
        const bucket = quarterOf(row.invoiceDate);
        if (bucket) bucket.expenseCents += sumNet([row]);
      }
      const result = cumulativeModelo130(quarters, quarter.quarter);
      cumulative = {
        from: yearStart.toISOString().slice(0, 10),
        to: range.to,
        quarter: quarter.quarter,
        incomeCents: cents(result.incomeCents),
        expenseCents: cents(result.expenseCents),
        netCents: cents(result.netCents),
        grossPaymentCents: cents(result.grossPaymentCents),
        previousPaymentsCents: cents(result.previousPaymentsCents),
        paymentCents: cents(result.paymentCents),
      };
    }
    return reply.send({
      kind: "modelo-130-preview",
      disclaimer: "Preview only. This is not an AEAT filing.",
      from: range.from,
      to: range.to,
      incomeCents: cents(preview.incomeCents),
      expenseCents: cents(preview.expenseCents),
      netCents: cents(preview.netCents),
      rate: preview.rate,
      paymentCents: cents(preview.paymentCents),
      cumulative,
    });
  });
}

type Amounts = { baseAmountCents: bigint | null; taxAmountCents: bigint | null; totalAmountCents: bigint | null };

function sumNet(rows: Amounts[]): bigint {
  return rows.reduce(
    (total, row) => total + netCents({ baseCents: row.baseAmountCents, taxCents: row.taxAmountCents, totalCents: row.totalAmountCents }),
    0n,
  );
}

function presentBucket(bucket: { rate: TaxPercent; baseCents: bigint; taxCents: bigint }) {
  return { rate: bucket.rate, baseCents: cents(bucket.baseCents), taxCents: cents(bucket.taxCents) };
}
