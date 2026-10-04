export interface FiscalDeadline {
  kind: "quarterly" | "annual";
  /** Period the filing covers. `quarter` is set only for quarterly filings. */
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  /** First and last day of the filing window, as YYYY-MM-DD. */
  opens: string;
  due: string;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** AEAT moves a deadline that falls on Saturday or Sunday to the next Monday. Public holidays are not modelled. */
function nextBusinessDay(date: Date): Date {
  const day = date.getUTCDay();
  const shift = day === 6 ? 2 : day === 0 ? 1 : 0;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + shift));
}

/** Filing windows for Modelo 303/130 (quarterly) and 390 (annual) whose deadline falls in `year`. */
function deadlinesIn(year: number): FiscalDeadline[] {
  const window = (month: number, lastDay: number) => ({
    opens: iso(new Date(Date.UTC(year, month - 1, 1))),
    due: iso(nextBusinessDay(new Date(Date.UTC(year, month - 1, lastDay)))),
  });
  return [
    { kind: "quarterly", year: year - 1, quarter: 4, ...window(1, 30) },
    { kind: "annual", year: year - 1, ...window(1, 30) },
    { kind: "quarterly", year, quarter: 1, ...window(4, 20) },
    { kind: "quarterly", year, quarter: 2, ...window(7, 20) },
    { kind: "quarterly", year, quarter: 3, ...window(10, 20) },
  ];
}

/** The next `count` deadlines on or after `today` (YYYY-MM-DD), soonest first. */
export function upcomingDeadlines(today: string, count = 3): FiscalDeadline[] {
  const year = Number(today.slice(0, 4));
  return [...deadlinesIn(year), ...deadlinesIn(year + 1)].filter((deadline) => deadline.due >= today).slice(0, count);
}

/** Whole days from `today` to `date`, both YYYY-MM-DD. */
export function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
