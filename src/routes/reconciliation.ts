import type { FastifyInstance } from "fastify";
import { InvoiceStatus, MatchStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { aiReconcileOrganization } from "../matching/ai-reconcile.js";
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
    const [suggestions, matched, allUnmatched, ignored, totalCount] = await Promise.all([
      hydrateSuggestions(prisma, result.suggestions),
      loadAllMatched(prisma, organizationId),
      prisma.bankTransaction.findMany({
        where: { organizationId, matchStatus: MatchStatus.UNMATCHED },
        orderBy: { transactionDate: "desc" },
      }),
      prisma.bankTransaction.findMany({
        where: { organizationId, matchStatus: MatchStatus.IGNORED },
        orderBy: { transactionDate: "desc" },
      }),
      prisma.bankTransaction.count({ where: { organizationId } }),
    ]);

    const suggestedTxIds = new Set(suggestions.map((s) => s.transaction.id));
    const unmatched = allUnmatched
      .filter((tx) => !suggestedTxIds.has(tx.id))
      .map(bankLine);

    const stats = {
      total: totalCount,
      matched: matched.length,
      suggestions: suggestions.length,
      unmatched: unmatched.length,
      ignored: ignored.length,
      completionPercent:
        totalCount > 0 ? Math.round(((matched.length + ignored.length) / totalCount) * 100) : 100,
    };

    return reply.send({
      suggestions,
      autoMatched: matched,
      matched,
      unmatched,
      ignored: ignored.map(bankLine),
      stats,
    });
  });

  app.get("/organizations/:organizationId/reconciliation/candidate-invoices", async (request, reply) => {
    const organizationId = organizationParam(request);
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const query = request.query as { transactionId?: string; search?: string };
    let transaction: {
      id: string;
      amountCents: bigint;
      currency: string;
      transactionDate: Date;
      rawDescription: string;
      normalizedMerchant: string | null;
    } | null = null;

    if (typeof query.transactionId === "string" && UUID.test(query.transactionId)) {
      transaction = await prisma.bankTransaction.findFirst({
        where: { id: query.transactionId, organizationId },
      });
    }

    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const invoices = await prisma.invoice.findMany({
      where: {
        organizationId,
        status: InvoiceStatus.PARSED,
        reconciliation: null,
        ...(search.length > 0
          ? {
              OR: [
                { vendorName: { contains: search, mode: "insensitive" } },
                { invoiceNumber: { contains: search, mode: "insensitive" } },
                { vendorTaxId: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { invoiceDate: "desc" },
      take: 50,
    });

    const candidates = invoices.map((inv) => {
      let score: number | null = null;
      let exactAmount = false;
      if (transaction !== null) {
        const scored = scorePair(toTransaction(transaction), {
          id: inv.id,
          vendorName: inv.vendorName,
          vendorTaxId: inv.vendorTaxId,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          currency: inv.currency,
          baseAmountCents: inv.baseAmountCents,
          totalAmountCents: inv.totalAmountCents,
        });
        score = scored.confidencePoints;
        exactAmount = scored.breakdown.amount.exact;
      }
      return {
        ...invoiceFields(inv),
        score,
        exactAmount,
      };
    });

    if (transaction !== null) {
      candidates.sort((a, b) => {
        if (a.exactAmount && !b.exactAmount) return -1;
        if (!a.exactAmount && b.exactAmount) return 1;
        return (b.score ?? 0) - (a.score ?? 0);
      });
    }

    return reply.send({ candidates });
  });

  app.post("/organizations/:organizationId/reconciliation/batch-confirm", async (request, reply) => {
    const organizationId = organizationParam(request);
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const body = (request.body ?? {}) as { pairs?: Array<{ transactionId: string; invoiceId: string }> };
    let pairsToConfirm: Array<{ transactionId: string; invoiceId: string }> = [];

    if (Array.isArray(body.pairs) && body.pairs.length > 0) {
      pairsToConfirm = body.pairs.filter(
        (p) => typeof p.transactionId === "string" && typeof p.invoiceId === "string",
      );
    } else {
      const reviewResult = await reconcileOrganization(prisma, organizationId);
      pairsToConfirm = reviewResult.suggestions.map((s) => ({
        transactionId: s.transactionId,
        invoiceId: s.invoiceId,
      }));
    }

    let confirmedCount = 0;
    for (const pair of pairsToConfirm) {
      try {
        const [txRow, invRow] = await Promise.all([
          prisma.bankTransaction.findFirst({
            where: { id: pair.transactionId, organizationId, matchStatus: MatchStatus.UNMATCHED },
          }),
          prisma.invoice.findFirst({
            where: { id: pair.invoiceId, organizationId, reconciliation: null },
          }),
        ]);
        if (txRow !== null && invRow !== null) {
          const scored = scorePair(toTransaction(txRow), {
            id: invRow.id,
            vendorName: invRow.vendorName,
            vendorTaxId: invRow.vendorTaxId,
            invoiceNumber: invRow.invoiceNumber,
            invoiceDate: invRow.invoiceDate,
            currency: invRow.currency,
            baseAmountCents: invRow.baseAmountCents,
            totalAmountCents: invRow.totalAmountCents,
          });
          await prisma.$transaction([
            prisma.reconciliationMatch.create({
              data: {
                organizationId,
                transactionId: txRow.id,
                invoiceId: invRow.id,
                confidenceScore: new Prisma.Decimal(scored.confidenceScore),
                isAutoConfirmed: false,
                matchingBreakdown: JSON.parse(JSON.stringify(scored.breakdown)) as Prisma.InputJsonValue,
                confirmedAt: new Date(),
                confirmedByUserId: request.userId ?? null,
              },
            }),
            prisma.bankTransaction.update({
              where: { id: txRow.id },
              data: { matchStatus: MatchStatus.MANUALLY_MATCHED },
            }),
          ]);
          confirmedCount++;
        }
      } catch {
        // Continue with next pair
      }
    }

    return reply.send({ confirmedCount });
  });

  app.post("/organizations/:organizationId/reconciliation/transactions/:transactionId/ignore", async (request, reply) => {
    const organizationId = organizationParam(request);
    const { transactionId } = request.params as { transactionId: string };
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (!UUID.test(transactionId)) {
      return reply.code(400).send({ error: "transactionId must be a UUID" });
    }
    const tx = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, organizationId },
    });
    if (tx === null) {
      return reply.code(404).send({ error: "Transaction not found" });
    }
    const updated = await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: { matchStatus: MatchStatus.IGNORED },
    });
    return reply.send({ id: updated.id, matchStatus: updated.matchStatus });
  });

  app.post("/organizations/:organizationId/reconciliation/transactions/:transactionId/unignore", async (request, reply) => {
    const organizationId = organizationParam(request);
    const { transactionId } = request.params as { transactionId: string };
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (!UUID.test(transactionId)) {
      return reply.code(400).send({ error: "transactionId must be a UUID" });
    }
    const tx = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, organizationId },
    });
    if (tx === null) {
      return reply.code(404).send({ error: "Transaction not found" });
    }
    const updated = await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: { matchStatus: MatchStatus.UNMATCHED },
    });
    return reply.send({ id: updated.id, matchStatus: updated.matchStatus });
  });

  app.post("/organizations/:organizationId/reconciliation/ai-analyze", async (request, reply) => {
    const organizationId = organizationParam(request);
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const result = await aiReconcileOrganization(prisma, organizationId);

    const txIds = [
      ...result.aiMatches.map((m) => m.transactionId),
      ...result.classifications.map((c) => c.transactionId),
    ];
    const invIds = result.aiMatches.map((m) => m.invoiceId);

    const [txRows, invRows] = await Promise.all([
      prisma.bankTransaction.findMany({ where: { id: { in: txIds } } }),
      prisma.invoice.findMany({ where: { id: { in: invIds } } }),
    ]);

    const txMap = new Map(txRows.map((t) => [t.id, bankLine(t)]));
    const invMap = new Map(invRows.map((i) => [i.id, invoiceFields(i)]));

    const matches = result.aiMatches.flatMap((m) => {
      const tx = txMap.get(m.transactionId);
      const inv = invMap.get(m.invoiceId);
      if (!tx || !inv) return [];
      return [
        {
          transactionId: m.transactionId,
          invoiceId: m.invoiceId,
          confidenceScore: m.confidenceScore,
          reason: m.reason,
          transaction: tx,
          invoice: inv,
        },
      ];
    });

    const classifications = result.classifications.flatMap((c) => {
      const tx = txMap.get(c.transactionId);
      if (!tx) return [];
      return [
        {
          transactionId: c.transactionId,
          suggestedType: c.suggestedType,
          reason: c.reason,
          transaction: tx,
        },
      ];
    });

    return reply.send({ matches, classifications });
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
            confirmedByUserId: request.userId ?? null,
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

async function loadAllMatched(prisma: PrismaClient, organizationId: string) {
  const matches = await prisma.reconciliationMatch.findMany({
    where: { organizationId },
    include: { transaction: true, invoice: true },
    orderBy: { confirmedAt: "desc" },
  });
  return matches.map((match) => ({
    id: match.id,
    confidenceScore: match.confidenceScore.toFixed(4),
    isAutoConfirmed: match.isAutoConfirmed,
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
