export interface TrendRow {
  date: Date | null;
  baseCents: bigint | null;
  totalCents: bigint | null;
  taxCents: bigint | null;
}

export interface TrendMonth {
  month: string;
  incomeCents: bigint;
  expenseCents: bigint;
}

/** First day of the month `months - 1` months before `end`, and the first day of the month after `end`, both in UTC. */
export function trendWindow(end: Date, months: number): { from: Date; until: Date } {
  const from = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1), 1));
  const until = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  return { from, until };
}

/** Net amount of a document: the base when known, otherwise total minus tax, otherwise the total. */
function netCents(row: TrendRow): bigint {
  if (row.baseCents !== null) return row.baseCents;
  if (row.totalCents !== null) return row.totalCents - (row.taxCents ?? 0n);
  return 0n;
}

/** Buckets issued (income) and received (expense) documents into consecutive months ending at `end`, using net amounts. */
export function monthlyTrend(income: TrendRow[], expenses: TrendRow[], end: Date, months: number): TrendMonth[] {
  const { from } = trendWindow(end, months);
  const result: TrendMonth[] = [];
  const index = new Map<string, TrendMonth>();
  for (let offset = 0; offset < months; offset += 1) {
    const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1));
    const month = date.toISOString().slice(0, 7);
    const bucket = { month, incomeCents: 0n, expenseCents: 0n };
    result.push(bucket);
    index.set(month, bucket);
  }
  for (const row of income) {
    const bucket = row.date ? index.get(row.date.toISOString().slice(0, 7)) : undefined;
    if (bucket) bucket.incomeCents += netCents(row);
  }
  for (const row of expenses) {
    const bucket = row.date ? index.get(row.date.toISOString().slice(0, 7)) : undefined;
    if (bucket) bucket.expenseCents += netCents(row);
  }
  return result;
}
