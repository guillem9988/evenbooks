import type { FastifyInstance } from "fastify";
import {
  InvoiceStatus,
  IssuedInvoiceStatus,
  MatchStatus,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client.js";
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

    const query = request.query as { transactionId?: string; search?: string; type?: string };
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

    const search = typeof query.search === "string" ? query.search.trim() : "";
    const isCredit = transaction ? transaction.amountCents > 0n : false;
    const wantIssued = query.type === "issued" || (!query.type && isCredit);

    if (wantIssued) {
      // Query issued invoices (client income)
      const issuedInvoices = await prisma.issuedInvoice.findMany({
        where: {
          organizationId,
          status: IssuedInvoiceStatus.UNPAID,
          reconciliation: null,
          ...(search.length > 0
            ? {
                OR: [
                  { seriesNumber: { contains: search, mode: "insensitive" } },
                  { contact: { legalName: { contains: search, mode: "insensitive" } } },
                  { contact: { taxId: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: { contact: true },
        orderBy: { invoiceDate: "desc" },
        take: 50,
      });

      const candidates = issuedInvoices.map((inv) => {
        let score: number | null = null;
        let exactAmount = false;
        if (transaction !== null) {
          const scored = scorePair(toTransaction(transaction), {
            id: inv.id,
            vendorName: inv.contact.legalName,
            vendorTaxId: inv.contact.taxId,
            invoiceNumber: inv.seriesNumber,
            invoiceDate: inv.invoiceDate,
            currency: "EUR",
            baseAmountCents: inv.baseAmountCents,
            totalAmountCents: inv.totalAmountCents,
            targetType: "ISSUED",
          });
          score = scored.confidencePoints;
          exactAmount = scored.breakdown.amount.exact;
        }
        return {
          id: inv.id,
          vendorName: inv.contact.legalName,
          vendorTaxId: inv.contact.taxId,
          invoiceNumber: inv.seriesNumber,
          invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
          totalAmountCents: inv.totalAmountCents.toString(),
          currency: "EUR",
          isIssued: true,
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
    }

    // Default: Supplier expense invoices
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
          targetType: "EXPENSE",
        });
        score = scored.confidencePoints;
        exactAmount = scored.breakdown.amount.exact;
      }
      return {
        ...invoiceFields(inv),
        isIssued: false,
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

    const body = (request.body ?? {}) as {
      pairs?: Array<{
        transactionId: string;
        invoiceId?: string;
        issuedInvoiceId?: string;
        isIssued?: boolean;
      }>;
    };
    let pairsToConfirm: Array<{
      transactionId: string;
      invoiceId?: string;
      issuedInvoiceId?: string;
      isIssued?: boolean;
    }> = [];

    if (Array.isArray(body.pairs) && body.pairs.length > 0) {
      pairsToConfirm = body.pairs.filter(
        (p) => typeof p.transactionId === "string" && (typeof p.invoiceId === "string" || typeof p.issuedInvoiceId === "string"),
      );
    } else {
      const reviewResult = await reconcileOrganization(prisma, organizationId);
      pairsToConfirm = reviewResult.suggestions.map((s) => ({
        transactionId: s.transactionId,
        invoiceId: s.invoiceId ?? undefined,
        issuedInvoiceId: s.issuedInvoiceId ?? undefined,
        isIssued: s.targetType === "ISSUED",
      }));
    }

    let confirmedCount = 0;
    for (const pair of pairsToConfirm) {
      try {
        const isIssued = pair.isIssued === true || Boolean(pair.issuedInvoiceId);
        const targetId = (isIssued ? pair.issuedInvoiceId : pair.invoiceId) ?? pair.invoiceId;
        if (!targetId) continue;

        if (isIssued) {
          const [txRow, issuedRow] = await Promise.all([
            prisma.bankTransaction.findFirst({
              where: { id: pair.transactionId, organizationId, matchStatus: MatchStatus.UNMATCHED },
            }),
            prisma.issuedInvoice.findFirst({
              where: { id: targetId, organizationId, reconciliation: null },
              include: { contact: true },
            }),
          ]);
          if (txRow !== null && issuedRow !== null) {
            const scored = scorePair(toTransaction(txRow), {
              id: issuedRow.id,
              vendorName: issuedRow.contact.legalName,
              vendorTaxId: issuedRow.contact.taxId,
              invoiceNumber: issuedRow.seriesNumber,
              invoiceDate: issuedRow.invoiceDate,
              currency: "EUR",
              baseAmountCents: issuedRow.baseAmountCents,
              totalAmountCents: issuedRow.totalAmountCents,
              targetType: "ISSUED",
            });
            await prisma.$transaction([
              prisma.reconciliationMatch.create({
                data: {
                  organizationId,
                  transactionId: txRow.id,
                  invoiceId: null,
                  issuedInvoiceId: issuedRow.id,
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
              prisma.issuedInvoice.update({
                where: { id: issuedRow.id },
                data: { status: IssuedInvoiceStatus.PAID },
              }),
            ]);
            confirmedCount++;
          }
        } else {
          const [txRow, invRow] = await Promise.all([
            prisma.bankTransaction.findFirst({
              where: { id: pair.transactionId, organizationId, matchStatus: MatchStatus.UNMATCHED },
            }),
            prisma.invoice.findFirst({
              where: { id: targetId, organizationId, reconciliation: null },
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
              targetType: "EXPENSE",
            });
            await prisma.$transaction([
              prisma.reconciliationMatch.create({
                data: {
                  organizationId,
                  transactionId: txRow.id,
                  invoiceId: invRow.id,
                  issuedInvoiceId: null,
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
    const expenseMatches = result.aiMatches.filter((m) => !m.isIssued);
    const issuedMatches = result.aiMatches.filter((m) => m.isIssued);

    const [txRows, invRows, issuedRows] = await Promise.all([
      prisma.bankTransaction.findMany({ where: { id: { in: txIds } } }),
      expenseMatches.length > 0
        ? prisma.invoice.findMany({ where: { id: { in: expenseMatches.map((m) => m.invoiceId) } } })
        : [],
      issuedMatches.length > 0
        ? prisma.issuedInvoice.findMany({
            where: { id: { in: issuedMatches.map((m) => m.invoiceId) } },
            include: { contact: true },
          })
        : [],
    ]);

    const txMap = new Map(txRows.map((t) => [t.id, bankLine(t)]));
    const invMap = new Map(invRows.map((i) => [i.id, { ...invoiceFields(i), isIssued: false }]));
    const issuedMap = new Map(
      issuedRows.map((row) => [
        row.id,
        {
          id: row.id,
          vendorName: row.contact.legalName,
          vendorTaxId: row.contact.taxId,
          invoiceNumber: row.seriesNumber,
          invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
          totalAmountCents: row.totalAmountCents.toString(),
          currency: "EUR",
          isIssued: true,
        },
      ]),
    );

    const matches = result.aiMatches.flatMap((m) => {
      const tx = txMap.get(m.transactionId);
      const inv = m.isIssued ? issuedMap.get(m.invoiceId) : invMap.get(m.invoiceId);
      if (!tx || !inv) return [];
      return [
        {
          transactionId: m.transactionId,
          invoiceId: m.invoiceId,
          isIssued: m.isIssued ?? false,
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
    const body = request.body as {
      transactionId?: unknown;
      invoiceId?: unknown;
      issuedInvoiceId?: unknown;
      isIssued?: unknown;
    };
    if (typeof body?.transactionId !== "string" || !UUID.test(body.transactionId)) {
      return reply.code(400).send({ error: "transactionId must be a UUID" });
    }
    const targetId = typeof body.issuedInvoiceId === "string"
      ? body.issuedInvoiceId
      : typeof body.invoiceId === "string"
        ? body.invoiceId
        : "";
    if (!UUID.test(targetId)) {
      return reply.code(400).send({ error: "invoiceId or issuedInvoiceId must be a UUID" });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: body.transactionId, organizationId },
    });
    if (transaction === null) {
      return reply.code(404).send({ error: "Transaction not found" });
    }

    const wantIssued = body.isIssued === true || Boolean(body.issuedInvoiceId) || transaction.amountCents > 0n;

    // Check if target is an issued invoice
    let issuedInvoice = null;
    let expenseInvoice = null;

    if (wantIssued) {
      issuedInvoice = await prisma.issuedInvoice.findFirst({
        where: { id: targetId, organizationId },
        include: { contact: true },
      });
    }

    if (issuedInvoice === null) {
      expenseInvoice = await prisma.invoice.findFirst({
        where: { id: targetId, organizationId },
      });
    }

    if (issuedInvoice === null && expenseInvoice === null) {
      // Try finding in issuedInvoice if we didn't check it yet
      issuedInvoice = await prisma.issuedInvoice.findFirst({
        where: { id: targetId, organizationId },
        include: { contact: true },
      });
    }

    if (issuedInvoice === null && expenseInvoice === null) {
      return reply.code(404).send({ error: "Invoice not found" });
    }

    // Check existing match
    const existing = await prisma.reconciliationMatch.findFirst({
      where: {
        organizationId,
        OR: [
          { transactionId: body.transactionId },
          issuedInvoice ? { issuedInvoiceId: targetId } : { invoiceId: targetId },
        ],
      },
    });

    if (existing !== null || transaction.matchStatus !== MatchStatus.UNMATCHED) {
      return reply.code(409).send({ error: "Transaction or invoice is already matched" });
    }

    try {
      if (issuedInvoice !== null) {
        const scored = scorePair(toTransaction(transaction), {
          id: issuedInvoice.id,
          vendorName: issuedInvoice.contact.legalName,
          vendorTaxId: issuedInvoice.contact.taxId,
          invoiceNumber: issuedInvoice.seriesNumber,
          invoiceDate: issuedInvoice.invoiceDate,
          currency: "EUR",
          baseAmountCents: issuedInvoice.baseAmountCents,
          totalAmountCents: issuedInvoice.totalAmountCents,
          targetType: "ISSUED",
        });

        const match = await prisma.$transaction(async (tx) => {
          const created = await tx.reconciliationMatch.create({
            data: {
              organizationId,
              transactionId: transaction.id,
              invoiceId: null,
              issuedInvoiceId: issuedInvoice.id,
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
          await tx.issuedInvoice.update({
            where: { id: issuedInvoice.id },
            data: { status: IssuedInvoiceStatus.PAID },
          });
          return created;
        });

        return reply.code(201).send({ id: match.id, matchStatus: MatchStatus.MANUALLY_MATCHED });
      }

      // Expense invoice
      const scored = scorePair(toTransaction(transaction), {
        id: expenseInvoice!.id,
        vendorName: expenseInvoice!.vendorName,
        vendorTaxId: expenseInvoice!.vendorTaxId,
        invoiceNumber: expenseInvoice!.invoiceNumber,
        invoiceDate: expenseInvoice!.invoiceDate,
        currency: expenseInvoice!.currency,
        baseAmountCents: expenseInvoice!.baseAmountCents,
        totalAmountCents: expenseInvoice!.totalAmountCents,
        targetType: "EXPENSE",
      });

      const match = await prisma.$transaction(async (tx) => {
        const created = await tx.reconciliationMatch.create({
          data: {
            organizationId,
            transactionId: transaction.id,
            invoiceId: expenseInvoice!.id,
            issuedInvoiceId: null,
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
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.reconciliationMatch.delete({ where: { id: match.id } }),
      prisma.bankTransaction.update({
        where: { id: match.transactionId },
        data: { matchStatus: MatchStatus.UNMATCHED },
      }),
    ];
    if (match.issuedInvoiceId) {
      ops.push(
        prisma.issuedInvoice.update({
          where: { id: match.issuedInvoiceId },
          data: { status: IssuedInvoiceStatus.UNPAID },
        }),
      );
    }
    await prisma.$transaction(ops);
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
  const txIds = pairs.map((pair) => pair.transactionId);
  const expenseIds = pairs
    .filter((p) => p.targetType !== "ISSUED" && p.invoiceId)
    .map((p) => p.invoiceId as string);
  const issuedIds = pairs
    .filter((p) => p.targetType === "ISSUED" && p.issuedInvoiceId)
    .map((p) => p.issuedInvoiceId as string);

  const [transactions, invoices, issuedInvoices] = await Promise.all([
    prisma.bankTransaction.findMany({ where: { id: { in: txIds } } }),
    expenseIds.length > 0
      ? prisma.invoice.findMany({ where: { id: { in: expenseIds } } })
      : [],
    issuedIds.length > 0
      ? prisma.issuedInvoice.findMany({
          where: { id: { in: issuedIds } },
          include: { contact: true },
        })
      : [],
  ]);

  const transactionById = new Map(transactions.map((row) => [row.id, row]));
  const invoiceById = new Map(invoices.map((row) => [row.id, invoiceFields(row)]));
  const issuedById = new Map(
    issuedInvoices.map((row) => [
      row.id,
      {
        id: row.id,
        vendorName: row.contact.legalName,
        vendorTaxId: row.contact.taxId,
        invoiceNumber: row.seriesNumber,
        invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
        totalAmountCents: row.totalAmountCents.toString(),
        currency: "EUR",
        isIssued: true,
      },
    ]),
  );

  return pairs.flatMap((pair) => {
    const transaction = transactionById.get(pair.transactionId);
    const invoice =
      pair.targetType === "ISSUED"
        ? (pair.issuedInvoiceId ? issuedById.get(pair.issuedInvoiceId) : undefined)
        : (pair.invoiceId ? invoiceById.get(pair.invoiceId) : undefined);

    if (transaction === undefined || invoice === undefined) {
      return [];
    }
    return [
      {
        confidenceScore: pair.confidenceScore,
        breakdown: pair.breakdown,
        transaction: bankLine(transaction),
        invoice,
      },
    ];
  });
}

async function loadAllMatched(prisma: PrismaClient, organizationId: string) {
  const matches = await prisma.reconciliationMatch.findMany({
    where: { organizationId },
    include: {
      transaction: true,
      invoice: true,
      issuedInvoice: { include: { contact: true } },
    },
    orderBy: { confirmedAt: "desc" },
  });
  return matches.flatMap((match) => {
    let invoiceInfo;
    if (match.issuedInvoice) {
      invoiceInfo = {
        id: match.issuedInvoice.id,
        vendorName: match.issuedInvoice.contact.legalName,
        vendorTaxId: match.issuedInvoice.contact.taxId,
        invoiceNumber: match.issuedInvoice.seriesNumber,
        invoiceDate: match.issuedInvoice.invoiceDate.toISOString().slice(0, 10),
        totalAmountCents: match.issuedInvoice.totalAmountCents.toString(),
        currency: "EUR",
        isIssued: true,
      };
    } else if (match.invoice) {
      invoiceInfo = {
        ...invoiceFields(match.invoice),
        isIssued: false,
      };
    } else {
      return [];
    }

    return [
      {
        id: match.id,
        confidenceScore: match.confidenceScore.toFixed(4),
        isAutoConfirmed: match.isAutoConfirmed,
        breakdown: match.matchingBreakdown,
        transaction: bankLine(match.transaction),
        invoice: invoiceInfo,
      },
    ];
  });
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
