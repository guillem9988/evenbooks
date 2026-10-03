import { normalizeTaxId } from "./normalize.js";
import { textSimilarity } from "./text-score.js";

/** Component weights. They sum to 10_000. */
export const WEIGHTS = {
  amount: 4_500,
  date: 2_000,
  text: 2_000,
  vendor: 1_500,
} as const;

export const AUTO_CONFIRM_MIN = 8_800;
export const SUGGESTION_MIN = 6_500;

export interface MatchTransaction {
  id: string;
  amountCents: bigint;
  currency: string;
  transactionDate: Date;
  rawDescription: string;
  normalizedMerchant: string | null;
}

export type MatchTargetType = "EXPENSE" | "ISSUED";

export interface MatchInvoice {
  id: string;
  vendorName: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  currency: string | null;
  baseAmountCents: bigint | null;
  totalAmountCents: bigint | null;
  previouslyConfirmedVendor?: boolean;
  targetType?: MatchTargetType;
}

export interface ScorePart {
  score: string;
  points: number;
}

export interface MatchingBreakdown {
  amount: ScorePart & {
    transactionCents: string;
    invoiceCents: string | null;
    exact: boolean;
  };
  date: ScorePart & { dayGap: number | null };
  text: ScorePart & { transactionText: string; vendorText: string };
  vendor: ScorePart & { nifMatched: boolean; previouslyConfirmed: boolean; invoiceNumberMatched?: boolean };
  currencyCompatible: boolean;
  weights: { amount: string; date: string; text: string; vendor: string };
}

export interface ScoredPair {
  transactionId: string;
  invoiceId: string | null;
  issuedInvoiceId?: string | null;
  targetType: MatchTargetType;
  confidencePoints: number;
  confidenceScore: string;
  autoConfirm: boolean;
  breakdown: MatchingBreakdown;
}

export function scorePair(transaction: MatchTransaction, invoice: MatchInvoice): ScoredPair {
  const currencyCompatible = currenciesCompatible(transaction.currency, invoice.currency);
  const amount = scoreAmount(transaction.amountCents, invoice, currencyCompatible);
  const date = scoreDate(transaction.transactionDate, invoice.invoiceDate);
  const textPoints = Math.round(textSimilarity(invoice.vendorName ?? "", transaction.rawDescription) * 10_000);
  const vendor = scoreVendor(transaction.rawDescription, invoice);

  const confidencePoints = Math.round(
    (amount.points * WEIGHTS.amount +
      date.points * WEIGHTS.date +
      textPoints * WEIGHTS.text +
      vendor.points * WEIGHTS.vendor) /
      10_000,
  );

  const isIssued = invoice.targetType === "ISSUED";

  return {
    transactionId: transaction.id,
    invoiceId: isIssued ? null : invoice.id,
    issuedInvoiceId: isIssued ? invoice.id : null,
    targetType: isIssued ? "ISSUED" : "EXPENSE",
    confidencePoints,
    confidenceScore: formatPoints(confidencePoints),
    autoConfirm: confidencePoints >= AUTO_CONFIRM_MIN && currencyCompatible,
    breakdown: {
      amount: {
        score: formatPoints(amount.points),
        points: amount.points,
        transactionCents: transaction.amountCents.toString(),
        invoiceCents: invoice.totalAmountCents?.toString() ?? null,
        exact: amount.exact,
      },
      date: { score: formatPoints(date.points), points: date.points, dayGap: date.dayGap },
      text: {
        score: formatPoints(textPoints),
        points: textPoints,
        transactionText: transaction.rawDescription,
        vendorText: invoice.vendorName ?? "",
      },
      vendor: {
        score: formatPoints(vendor.points),
        points: vendor.points,
        nifMatched: vendor.nifMatched,
        previouslyConfirmed: vendor.previouslyConfirmed,
        invoiceNumberMatched: vendor.invoiceNumberMatched,
      },
      currencyCompatible,
      weights: { amount: "0.4500", date: "0.2000", text: "0.2000", vendor: "0.1500" },
    },
  };
}

export function formatPoints(points: number): string {
  const clamped = Math.max(0, Math.min(10_000, Math.round(points)));
  const whole = Math.floor(clamped / 10_000);
  const fraction = (clamped % 10_000).toString().padStart(4, "0");
  return `${whole}.${fraction}`;
}

function currenciesCompatible(transactionCurrency: string, invoiceCurrency: string | null): boolean {
  return transactionCurrency.toUpperCase() === (invoiceCurrency ?? "EUR").toUpperCase();
}

function scoreAmount(
  transactionCents: bigint,
  invoice: MatchInvoice,
  currencyCompatible: boolean,
): { points: number; exact: boolean } {
  if (!currencyCompatible || invoice.totalAmountCents === null) {
    return { points: 0, exact: false };
  }
  const spent = absBigInt(transactionCents);
  const total = absBigInt(invoice.totalAmountCents);
  const difference = spent > total ? spent - total : total - spent;
  if (difference === 0n) {
    return { points: 10_000, exact: true };
  }
  if (difference <= 2n) {
    return { points: 9_000, exact: false };
  }
  if (invoice.baseAmountCents !== null && spent === absBigInt(invoice.baseAmountCents)) {
    return { points: 8_500, exact: false };
  }
  return { points: 0, exact: false };
}

function scoreDate(transactionDate: Date, invoiceDate: Date | null): { points: number; dayGap: number | null } {
  if (invoiceDate === null) {
    return { points: 0, dayGap: null };
  }
  const dayGap = utcDayNumber(transactionDate) - utcDayNumber(invoiceDate);
  const gap = Math.abs(dayGap);
  let points = 0;
  if (gap === 0) points = 10_000;
  else if (gap <= 3) points = 9_000;
  else if (gap <= 7) points = 6_000;
  else if (gap <= 30) points = 3_000;
  if (dayGap < -1) {
    points = Math.round(points / 2);
  }
  return { points, dayGap };
}

function scoreVendor(
  description: string,
  invoice: MatchInvoice,
): { points: number; nifMatched: boolean; previouslyConfirmed: boolean; invoiceNumberMatched: boolean } {
  const taxId = normalizeTaxId(invoice.vendorTaxId);
  const cleanDesc = description.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const nifMatched = taxId !== null && cleanDesc.includes(taxId);

  const cleanNum = invoice.invoiceNumber?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  const invoiceNumberMatched = cleanNum.length >= 3 && cleanDesc.includes(cleanNum);

  if (nifMatched || invoiceNumberMatched) {
    return { points: 10_000, nifMatched, previouslyConfirmed: false, invoiceNumberMatched };
  }
  if (invoice.previouslyConfirmedVendor === true) {
    return { points: 8_000, nifMatched: false, previouslyConfirmed: true, invoiceNumberMatched: false };
  }
  return { points: 5_000, nifMatched: false, previouslyConfirmed: false, invoiceNumberMatched: false };
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function utcDayNumber(value: Date): number {
  return Math.floor(value.getTime() / 86_400_000);
}
