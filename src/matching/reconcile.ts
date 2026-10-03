import {
  InvoiceStatus,
  IssuedInvoiceStatus,
  MatchStatus,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client.js";
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
  const [transactions, invoices, issuedInvoices, confirmedVendors, confirmedClients] = await Promise.all([
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
    prisma.issuedInvoice.findMany({
      where: {
        organizationId,
        status: IssuedInvoiceStatus.UNPAID,
        reconciliation: null,
      },
      include: {
        contact: true,
      },
    }),
    confirmedVendorNames(prisma, organizationId),
    confirmedClientNames(prisma, organizationId),
  ]);

  const pairs: ScoredPair[] = [];
  for (const transaction of transactions) {
    const tx = toTransaction(transaction);
    if (transaction.amountCents < 0n) {
      for (const invoice of invoices) {
        pairs.push(scorePair(tx, toExpenseInvoice(invoice, confirmedVendors)));
      }
    } else if (transaction.amountCents > 0n) {
      for (const issued of issuedInvoices) {
        pairs.push(scorePair(tx, toIssuedInvoice(issued, confirmedClients)));
      }
    }
  }

  const assignment = assignMatches(pairs);

  if (assignment.confirmed.length > 0) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const pair of assignment.confirmed) {
      const isIssued = pair.targetType === "ISSUED";
      ops.push(
        prisma.reconciliationMatch.create({
          data: {
            organizationId,
            transactionId: pair.transactionId,
            invoiceId: isIssued ? null : pair.invoiceId,
            issuedInvoiceId: isIssued ? pair.issuedInvoiceId : null,
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
      );
      if (isIssued && pair.issuedInvoiceId) {
        ops.push(
          prisma.issuedInvoice.update({
            where: { id: pair.issuedInvoiceId },
            data: { status: IssuedInvoiceStatus.PAID },
          }),
        );
      }
    }
    await prisma.$transaction(ops);
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

async function confirmedClientNames(prisma: PrismaClient, organizationId: string): Promise<Set<string>> {
  const rows = await prisma.issuedInvoice.findMany({
    where: { organizationId, reconciliation: { isNot: null } },
    select: { contact: { select: { legalName: true } } },
  });
  return new Set(rows.map((row) => row.contact.legalName.toLowerCase()));
}

function toExpenseInvoice(
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
    targetType: "EXPENSE",
    previouslyConfirmedVendor:
      row.vendorName !== null && confirmedVendors.has(row.vendorName.toLowerCase()),
  };
}

function toIssuedInvoice(
  row: {
    id: string;
    seriesNumber: string;
    invoiceDate: Date;
    baseAmountCents: bigint;
    totalAmountCents: bigint;
    contact: {
      legalName: string;
      taxId: string;
    };
  },
  confirmedClients: Set<string>,
): MatchInvoice {
  return {
    id: row.id,
    vendorName: row.contact.legalName,
    vendorTaxId: row.contact.taxId,
    invoiceNumber: row.seriesNumber,
    invoiceDate: row.invoiceDate,
    currency: "EUR",
    baseAmountCents: row.baseAmountCents,
    totalAmountCents: row.totalAmountCents,
    targetType: "ISSUED",
    previouslyConfirmedVendor: confirmedClients.has(row.contact.legalName.toLowerCase()),
  };
}
