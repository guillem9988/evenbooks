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
  const [transactions, invoices, confirmedVendors] = await Promise.all([
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
    confirmedVendorNames(prisma, organizationId),
  ]);

  const pairs = transactions.flatMap((transaction) =>
    invoices.map((invoice) => scorePair(toTransaction(transaction), toInvoice(invoice, confirmedVendors))),
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

async function confirmedVendorNames(prisma: PrismaClient, organizationId: string): Promise<Set<string>> {
  const rows = await prisma.invoice.findMany({
    where: { organizationId, reconciliation: { isNot: null }, vendorName: { not: null } },
    select: { vendorName: true },
  });
  return new Set(rows.flatMap((row) => (row.vendorName === null ? [] : [row.vendorName.toLowerCase()])));
}

function toInvoice(
  row: {
    id: string;
    vendorName: string | null;
    vendorTaxId: string | null;
    invoiceNumber: string | null;
    invoiceDate: Date | null;
    currency: string | null;
    baseAmountCents: bigint | null;
    totalAmountCents: bigint | null;
  },
  confirmedVendors: Set<string>,
): MatchInvoice {
  return {
    id: row.id,
    vendorName: row.vendorName,
    vendorTaxId: row.vendorTaxId,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    currency: row.currency,
    baseAmountCents: row.baseAmountCents,
    totalAmountCents: row.totalAmountCents,
    previouslyConfirmedVendor:
      row.vendorName !== null && confirmedVendors.has(row.vendorName.toLowerCase()),
  };
}
