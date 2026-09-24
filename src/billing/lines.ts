import { TaxRateType } from "../../generated/prisma/client.js";

export const TAX_RATES = [21, 10, 4, 0] as const;
export type TaxPercent = (typeof TAX_RATES)[number];

export interface LineInput {
  description: string;
  quantity: number;
  unitAmountCents: bigint;
  taxRate: TaxPercent;
}

export interface ComputedLine extends LineInput {
  taxRateType: TaxRateType;
  baseAmountCents: bigint;
  taxAmountCents: bigint;
  totalAmountCents: bigint;
}

export interface ComputedDocument {
  lines: ComputedLine[];
  baseAmountCents: bigint;
  taxAmountCents: bigint;
  totalAmountCents: bigint;
}

export function computeDocument(lines: LineInput[]): ComputedDocument {
  const computed = lines.map((line) => {
    const baseAmountCents = BigInt(line.quantity) * line.unitAmountCents;
    const taxAmountCents = (baseAmountCents * BigInt(line.taxRate) + 50n) / 100n;
    return {
      ...line,
      taxRateType: rateToEnum(line.taxRate),
      baseAmountCents,
      taxAmountCents,
      totalAmountCents: baseAmountCents + taxAmountCents,
    };
  });
  return {
    lines: computed,
    baseAmountCents: sum(computed.map((line) => line.baseAmountCents)),
    taxAmountCents: sum(computed.map((line) => line.taxAmountCents)),
    totalAmountCents: sum(computed.map((line) => line.totalAmountCents)),
  };
}

export interface RateBucket {
  rate: TaxPercent;
  baseCents: bigint;
  taxCents: bigint;
}

export function groupByRate(rows: Array<{ rate: TaxPercent; baseCents: bigint; taxCents: bigint }>): RateBucket[] {
  const buckets = new Map<TaxPercent, RateBucket>();
  for (const row of rows) {
    const current = buckets.get(row.rate) ?? { rate: row.rate, baseCents: 0n, taxCents: 0n };
    current.baseCents += row.baseCents;
    current.taxCents += row.taxCents;
    buckets.set(row.rate, current);
  }
  return [...buckets.values()].sort((left, right) => right.rate - left.rate);
}

export function rateToEnum(rate: TaxPercent): TaxRateType {
  if (rate === 21) return TaxRateType.GENERAL_21;
  if (rate === 10) return TaxRateType.REDUCED_10;
  if (rate === 4) return TaxRateType.SUPER_REDUCED_4;
  return TaxRateType.EXEMPT_0;
}

export function enumToRate(rate: TaxRateType | null): TaxPercent | null {
  if (rate === TaxRateType.GENERAL_21) return 21;
  if (rate === TaxRateType.REDUCED_10) return 10;
  if (rate === TaxRateType.SUPER_REDUCED_4) return 4;
  if (rate === TaxRateType.EXEMPT_0) return 0;
  return null;
}

export function parseTaxPercent(value: unknown): TaxPercent | null {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (number === 21 || number === 10 || number === 4 || number === 0) {
    return number;
  }
  return null;
}

export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 1_000_000) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (parsed > 0 && parsed <= 1_000_000) {
      return parsed;
    }
  }
  return null;
}

export function parseCents(value: unknown): bigint | null {
  if (typeof value === "bigint" && value >= 0n) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return null;
}

function sum(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}
