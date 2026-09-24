import { InvoiceStatus, MatchStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { assignMatches } from "./assign.js";
import { scorePair, type MatchInvoice, type MatchTransaction, type ScoredPair } from "./score.js";

export interface ReconcileResult {
  confirmed: ScoredPair[];
  suggestions: ScoredPair[];
}

export async function reconcileOrganization(
  prisma: PrismaClient,
  organizationId: string,
): Promise<ReconcileResult> {
  const [transactions, invoices] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { organizationId, matchStatus: MatchStatus.UNMATCHED },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: InvoiceStatus.PARSED,
        reconciliation: null,
      },
    }),
  ]);

  const pairs = transactions.flatMap((transaction) =>
    invoices.map((invoice) => scorePair(toTransaction(transaction), toInvoice(invoice))),
  );
  const assignment = assignMatches(pairs);

  if (assignment.confirmed.length > 0) {
    await prisma.$transaction(
      assignment.confirmed.flatMap((pair) => [
        prisma.reconciliationMatch.create({
          data: {
            organizationId,
            transactionId: pair.transactionId,
            invoiceId: pair.invoiceId,
            confidenceScore: new Prisma.Decimal(pair.confidenceScore),
            isAutoConfirmed: true,
            matchingBreakdown: JSON.parse(JSON.stringify(pair.breakdown)) as Prisma.InputJsonValue,
            confirmedAt: new Date(),
          },
        }),
        prisma.bankTransaction.update({
          where: { id: pair.transactionId },
          data: { matchStatus: MatchStatus.AUTO_MATCHED },
        }),
      ]),
    );
  }

  return assignment;
}

function toTransaction(row: {
  id: string;
  amountCents: bigint;
  currency: string;
  transactionDate: Date;
  rawDescription: string;
  normalizedMerchant: string | null;
}): MatchTransaction {
  return {
    id: row.id,
    amountCents: row.amountCents,
    currency: row.currency,
    transactionDate: row.transactionDate,
    rawDescription: row.rawDescription,
    normalizedMerchant: row.normalizedMerchant,
  };
}

function toInvoice(row: {
  id: string;
  vendorName: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  currency: string | null;
  totalAmountCents: bigint | null;
}): MatchInvoice {
  return {
    id: row.id,
    vendorName: row.vendorName,
    vendorTaxId: row.vendorTaxId,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    currency: row.currency,
    totalAmountCents: row.totalAmountCents,
  };
}
