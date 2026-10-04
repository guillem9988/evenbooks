import { describe, expect, it } from "vitest";
import { monthlyTrend, trendWindow } from "./trend.js";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("monthlyTrend", () => {
  it("returns consecutive months across a year boundary", () => {
    const months = monthlyTrend([], [], day("2026-02-15"), 4);
    expect(months.map((row) => row.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("sums net amounts and ignores rows outside the window", () => {
    const months = monthlyTrend(
      [
        { date: day("2026-01-10"), baseCents: 10000n, taxCents: 2100n, totalCents: 12100n },
        { date: day("2026-01-20"), baseCents: 5000n, taxCents: 500n, totalCents: 5500n },
        { date: day("2025-06-01"), baseCents: 99999n, taxCents: 0n, totalCents: 99999n },
      ],
      [
        { date: day("2026-02-03"), baseCents: null, taxCents: 210n, totalCents: 1210n },
        { date: null, baseCents: 700n, taxCents: null, totalCents: null },
      ],
      day("2026-02-28"),
      2,
    );
    expect(months).toEqual([
      { month: "2026-01", incomeCents: 15000n, expenseCents: 0n },
      { month: "2026-02", incomeCents: 0n, expenseCents: 1000n },
    ]);
  });

  it("builds a half-open window from the first month to the month after the end", () => {
    const { from, until } = trendWindow(day("2026-10-04"), 12);
    expect(from.toISOString().slice(0, 10)).toBe("2025-11-01");
    expect(until.toISOString().slice(0, 10)).toBe("2026-11-01");
  });
});
