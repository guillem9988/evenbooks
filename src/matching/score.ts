import { foldText, normalizeTaxId } from "./normalize.js";
import { trigramScore } from "./trigram.js";

/** Component weights. They sum to 10_000. */
export const WEIGHTS = {
  amount: 5_000,
  date: 2_000,
  text: 2_000,
  taxId: 1_000,
} as const;

export const AUTO_CONFIRM_MIN = 8_500;
export const SUGGESTION_MIN = 4_500;

export interface MatchTransaction {
  id: string;
  amountCents: bigint;
  currency: string;
  transactionDate: Date;
  rawDescription: string;
  normalizedMerchant: string | null;
}

export interface MatchInvoice {
  id: string;
  vendorName: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  currency: string | null;
  totalAmountCents: bigint | null;
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
  taxId: ScorePart & { matched: boolean };
  currencyCompatible: boolean;
  weights: { amount: string; date: string; text: string; taxId: string };
}

export interface ScoredPair {
  transactionId: string;
  invoiceId: string;
  confidencePoints: number;
  confidenceScore: string;
  autoConfirm: boolean;
  breakdown: MatchingBreakdown;
}

export function scorePair(transaction: MatchTransaction, invoice: MatchInvoice): ScoredPair {
  const currencyCompatible = currenciesCompatible(transaction.currency, invoice.currency);
  const amount = scoreAmount(transaction.amountCents, invoice.totalAmountCents, currencyCompatible);
  const date = scoreDate(transaction.transactionDate, invoice.invoiceDate);
  const text = scoreText(transaction, invoice);
  const taxId = scoreTaxId(transaction.rawDescription, invoice.vendorTaxId);

  const confidencePoints = Math.round(
    (amount.points * WEIGHTS.amount +
      date.points * WEIGHTS.date +
      text.points * WEIGHTS.text +
      taxId.points * WEIGHTS.taxId) /
      10_000,
  );
  const autoConfirm = confidencePoints >= AUTO_CONFIRM_MIN && amount.exact && currencyCompatible;

  return {
    transactionId: transaction.id,
    invoiceId: invoice.id,
    confidencePoints,
    confidenceScore: formatPoints(confidencePoints),
    autoConfirm,
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
        score: formatPoints(text.points),
        points: text.points,
        transactionText: text.transactionText,
        vendorText: text.vendorText,
      },
      taxId: { score: formatPoints(taxId.points), points: taxId.points, matched: taxId.matched },
      currencyCompatible,
      weights: {
        amount: "0.5000",
        date: "0.2000",
        text: "0.2000",
        taxId: "0.1000",
      },
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
  const invoice = (invoiceCurrency ?? "EUR").toUpperCase();
  return transactionCurrency.toUpperCase() === invoice;
}

function scoreAmount(
  transactionCents: bigint,
  invoiceCents: bigint | null,
  currencyCompatible: boolean,
): { points: number; exact: boolean } {
  if (!currencyCompatible || invoiceCents === null) {
    return { points: 0, exact: false };
  }
  const exact = absBigInt(transactionCents) === absBigInt(invoiceCents);
  return { points: exact ? 10_000 : 0, exact };
}

function scoreDate(
  transactionDate: Date,
  invoiceDate: Date | null,
): { points: number; dayGap: number | null } {
  if (invoiceDate === null) {
    return { points: 0, dayGap: null };
  }
  const dayGap = utcDayNumber(transactionDate) - utcDayNumber(invoiceDate);
  if (dayGap < -2) {
    return { points: 0, dayGap };
  }
  if (dayGap < 0) {
    return { points: 5_000, dayGap };
  }
  if (dayGap === 0) {
    return { points: 10_000, dayGap };
  }
  if (dayGap <= 3) {
    return { points: 9_000, dayGap };
  }
  if (dayGap <= 7) {
    return { points: 7_000, dayGap };
  }
  if (dayGap <= 15) {
    return { points: 4_000, dayGap };
  }
  if (dayGap <= 30) {
    return { points: 2_000, dayGap };
  }
  if (dayGap <= 45) {
    return { points: 500, dayGap };
  }
  return { points: 0, dayGap };
}

function scoreText(
  transaction: MatchTransaction,
  invoice: MatchInvoice,
): { points: number; transactionText: string; vendorText: string } {
  const transactionText = foldText(transaction.normalizedMerchant ?? transaction.rawDescription);
  const vendorText = foldText(invoice.vendorName ?? "");
  let points = vendorText.length === 0 ? 0 : trigramScore(transactionText, vendorText);
  const invoiceNumber = foldText(invoice.invoiceNumber ?? "").replace(/ /g, "");
  const haystack = foldText(transaction.rawDescription).replace(/ /g, "");
  if (invoiceNumber.length >= 3 && haystack.includes(invoiceNumber)) {
    points = Math.max(points, 8_000);
  }
  return { points, transactionText, vendorText };
}

function scoreTaxId(description: string, vendorTaxId: string | null): { points: number; matched: boolean } {
  const taxId = normalizeTaxId(vendorTaxId);
  if (taxId === null) {
    return { points: 0, matched: false };
  }
  const haystack = description.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const matched = haystack.includes(taxId);
  return { points: matched ? 10_000 : 0, matched };
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function utcDayNumber(value: Date): number {
  return Math.floor(value.getTime() / 86_400_000);
}
