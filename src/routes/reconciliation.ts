import type { FastifyInstance } from "fastify";
import { MatchStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { reconcileOrganization } from "../matching/reconcile.js";
import { scorePair, type MatchTransaction, type ScoredPair } from "../matching/score.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerReconciliationRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/organizations/:organizationId/reconciliation/review", async (request, reply) => {
    const organizationId = organizationParam(request);
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const result = await reconcileOrganization(prisma, organizationId);
    const [suggestions, autoMatched] = await Promise.all([
      hydrateSuggestions(prisma, result.suggestions),
      loadAutoMatched(prisma, organizationId),
    ]);
    return reply.send({ suggestions, autoMatched });
  });

  app.post("/organizations/:organizationId/reconciliation/matches", async (request, reply) => {
    const organizationId = organizationParam(request);
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const body = request.body as { transactionId?: unknown; invoiceId?: unknown };
    if (typeof body?.transactionId !== "string" || !UUID.test(body.transactionId)) {
      return reply.code(400).send({ error: "transactionId must be a UUID" });
    }
    if (typeof body.invoiceId !== "string" || !UUID.test(body.invoiceId)) {
      return reply.code(400).send({ error: "invoiceId must be a UUID" });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const [transaction, invoice, existing] = await Promise.all([
      prisma.bankTransaction.findFirst({
        where: { id: body.transactionId, organizationId },
      }),
      prisma.invoice.findFirst({ where: { id: body.invoiceId, organizationId } }),
      prisma.reconciliationMatch.findFirst({
        where: {
          organizationId,
          OR: [{ transactionId: body.transactionId }, { invoiceId: body.invoiceId }],
        },
      }),
    ]);
    if (transaction === null || invoice === null) {
      return reply.code(404).send({ error: "Transaction or invoice not found" });
    }
    if (existing !== null || transaction.matchStatus !== MatchStatus.UNMATCHED) {
      return reply.code(409).send({ error: "Transaction or invoice is already matched" });
    }

    const scored = scorePair(toTransaction(transaction), {
      id: invoice.id,
      vendorName: invoice.vendorName,
      vendorTaxId: invoice.vendorTaxId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      currency: invoice.currency,
      baseAmountCents: invoice.baseAmountCents,
      totalAmountCents: invoice.totalAmountCents,
    });
    try {
      const match = await prisma.$transaction(async (tx) => {
        const created = await tx.reconciliationMatch.create({
          data: {
            organizationId,
            transactionId: transaction.id,
            invoiceId: invoice.id,
            confidenceScore: new Prisma.Decimal(scored.confidenceScore),
            isAutoConfirmed: false,
            matchingBreakdown: JSON.parse(JSON.stringify(scored.breakdown)) as Prisma.InputJsonValue,
            confirmedAt: new Date(),
          },
        });
        await tx.bankTransaction.update({
          where: { id: transaction.id },
          data: { matchStatus: MatchStatus.MANUALLY_MATCHED },
        });
        return created;
      });
      return reply.code(201).send({ id: match.id, matchStatus: MatchStatus.MANUALLY_MATCHED });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "Transaction or invoice is already matched" });
      }
      throw error;
    }
  });

  app.post("/organizations/:organizationId/reconciliation/matches/:matchId/reject", async (request, reply) => {
    const organizationId = organizationParam(request);
    const { matchId } = request.params as { matchId: string };
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (!UUID.test(matchId)) {
      return reply.code(400).send({ error: "matchId must be a UUID" });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const match = await prisma.reconciliationMatch.findFirst({
      where: { id: matchId, organizationId },
    });
    if (match === null) {
      return reply.code(404).send({ error: "Match not found" });
    }
    await prisma.$transaction([
      prisma.reconciliationMatch.delete({ where: { id: match.id } }),
      prisma.bankTransaction.update({
        where: { id: match.transactionId },
        data: { matchStatus: MatchStatus.UNMATCHED },
      }),
    ]);
    return reply.code(200).send({ id: match.id, matchStatus: MatchStatus.UNMATCHED });
  });
}

function organizationParam(request: { params: unknown }): string | Error {
  const organizationId = (request.params as { organizationId?: string }).organizationId ?? "";
  if (!UUID.test(organizationId)) {
    return new Error("organizationId must be a UUID");
  }
  return organizationId;
}

function findOrganization(prisma: PrismaClient, id: string) {
  return prisma.organization.findUnique({ where: { id }, select: { id: true } });
}

async function hydrateSuggestions(prisma: PrismaClient, pairs: ScoredPair[]) {
  if (pairs.length === 0) {
    return [];
  }
  const [transactions, invoices] = await Promise.all([
    prisma.bankTransaction.findMany({ where: { id: { in: pairs.map((pair) => pair.transactionId) } } }),
    prisma.invoice.findMany({ where: { id: { in: pairs.map((pair) => pair.invoiceId) } } }),
  ]);
  const transactionById = new Map(transactions.map((row) => [row.id, row]));
  const invoiceById = new Map(invoices.map((row) => [row.id, row]));
  return pairs.flatMap((pair) => {
    const transaction = transactionById.get(pair.transactionId);
    const invoice = invoiceById.get(pair.invoiceId);
    if (transaction === undefined || invoice === undefined) {
      return [];
    }
    return [
      {
        confidenceScore: pair.confidenceScore,
        breakdown: pair.breakdown,
        transaction: bankLine(transaction),
        invoice: invoiceFields(invoice),
      },
    ];
  });
}

async function loadAutoMatched(prisma: PrismaClient, organizationId: string) {
  const matches = await prisma.reconciliationMatch.findMany({
    where: { organizationId, isAutoConfirmed: true },
    include: { transaction: true, invoice: true },
    orderBy: { confirmedAt: "desc" },
  });
  return matches.map((match) => ({
    id: match.id,
    confidenceScore: match.confidenceScore.toFixed(4),
    isAutoConfirmed: true,
    breakdown: match.matchingBreakdown,
    transaction: bankLine(match.transaction),
    invoice: invoiceFields(match.invoice),
  }));
}

function bankLine(transaction: {
  id: string;
  transactionDate: Date;
  amountCents: bigint;
  currency: string;
  rawDescription: string;
  matchStatus: MatchStatus;
}) {
  return {
    id: transaction.id,
    transactionDate: transaction.transactionDate.toISOString().slice(0, 10),
    amountCents: transaction.amountCents.toString(),
    currency: transaction.currency,
    rawDescription: transaction.rawDescription,
    matchStatus: transaction.matchStatus,
  };
}

function invoiceFields(invoice: {
  id: string;
  vendorName: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  totalAmountCents: bigint | null;
  currency: string | null;
}) {
  return {
    id: invoice.id,
    vendorName: invoice.vendorName,
    vendorTaxId: invoice.vendorTaxId,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate?.toISOString().slice(0, 10) ?? null,
    totalAmountCents: invoice.totalAmountCents?.toString() ?? null,
    currency: invoice.currency,
  };
}

function toTransaction(row: {
  id: string;
  amountCents: bigint;
  currency: string;
  transactionDate: Date;
  rawDescription: string;
  normalizedMerchant: string | null;
}): MatchTransaction {
  return row;
}
