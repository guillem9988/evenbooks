/** 20% of a positive net, in integer cents, half up. A loss pays nothing. */
export function paymentOnAccountCents(netCents: bigint): bigint {
  if (netCents <= 0n) {
    return 0n;
  }
  return (netCents * 20n + 50n) / 100n;
}

export function previewModelo130(incomeCents: bigint, expenseCents: bigint) {
  const netCents = incomeCents - expenseCents;
  return {
    incomeCents,
    expenseCents,
    netCents,
    rate: "0.20" as const,
    paymentCents: paymentOnAccountCents(netCents),
  };
}

export interface QuarterAmounts {
  incomeCents: bigint;
  expenseCents: bigint;
}

/**
 * Modelo 130 as AEAT computes it: income and expenses accumulate from 1 January to the end of
 * `quarter` (casillas 01-03), 20% of a positive cumulative net is due (04), minus what earlier
 * quarters of the same year already paid (05). The result is never negative (07).
 * `quarters[0]` is Q1. Withholdings (casilla 06) are not modelled.
 */
export function cumulativeModelo130(quarters: QuarterAmounts[], quarter: 1 | 2 | 3 | 4) {
  let incomeCents = 0n;
  let expenseCents = 0n;
  let previousPaymentsCents = 0n;
  let result = { incomeCents, expenseCents, netCents: 0n, grossPaymentCents: 0n, previousPaymentsCents, paymentCents: 0n };
  for (let index = 0; index < quarter; index += 1) {
    incomeCents += quarters[index]?.incomeCents ?? 0n;
    expenseCents += quarters[index]?.expenseCents ?? 0n;
    const netCents = incomeCents - expenseCents;
    const grossPaymentCents = paymentOnAccountCents(netCents);
    const paymentCents = grossPaymentCents > previousPaymentsCents ? grossPaymentCents - previousPaymentsCents : 0n;
    result = { incomeCents, expenseCents, netCents, grossPaymentCents, previousPaymentsCents, paymentCents };
    previousPaymentsCents += paymentCents;
  }
  return result;
}

/** The calendar quarter `from`..`to` covers exactly, or null for any other range. */
export function exactQuarter(from: string, to: string): { year: number; quarter: 1 | 2 | 3 | 4 } | null {
  const ends: Record<string, [string, 1 | 2 | 3 | 4]> = {
    "01-01": ["03-31", 1],
    "04-01": ["06-30", 2],
    "07-01": ["09-30", 3],
    "10-01": ["12-31", 4],
  };
  const year = from.slice(0, 4);
  const match = ends[from.slice(5)];
  if (match === undefined || to !== `${year}-${match[0]}`) {
    return null;
  }
  return { year: Number(year), quarter: match[1] };
}
