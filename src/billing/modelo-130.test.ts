import { describe, expect, it } from "vitest";
import { cumulativeModelo130, exactQuarter, previewModelo130 } from "./modelo-130.js";

describe("modelo 130 preview", () => {
  it("charges 20% of a positive net and nothing on a loss", () => {
    const positive = previewModelo130(100000n, 40000n);
    expect(positive.netCents).toBe(60000n);
    expect(positive.paymentCents).toBe(12000n);
    expect(positive.rate).toBe("0.20");

    const negative = previewModelo130(10000n, 40000n);
    expect(negative.netCents).toBe(-30000n);
    expect(negative.paymentCents).toBe(0n);
  });
});

describe("cumulative modelo 130", () => {
  const year = [
    { incomeCents: 1000000n, expenseCents: 400000n }, // Q1 net 6.000 €
    { incomeCents: 200000n, expenseCents: 500000n }, // Q2 net -3.000 €
    { incomeCents: 1000000n, expenseCents: 200000n }, // Q3 net 8.000 €
    { incomeCents: 0n, expenseCents: 0n },
  ];

  it("accumulates from January and subtracts earlier payments", () => {
    expect(cumulativeModelo130(year, 1)).toMatchObject({ netCents: 600000n, grossPaymentCents: 120000n, previousPaymentsCents: 0n, paymentCents: 120000n });
    // Cumulative net 3.000 € → 600 € gross, but 1.200 € were already paid: nothing due.
    expect(cumulativeModelo130(year, 2)).toMatchObject({ netCents: 300000n, grossPaymentCents: 60000n, previousPaymentsCents: 120000n, paymentCents: 0n });
    // Cumulative net 11.000 € → 2.200 € gross minus the 1.200 € paid in Q1.
    expect(cumulativeModelo130(year, 3)).toMatchObject({ incomeCents: 2200000n, expenseCents: 1100000n, netCents: 1100000n, previousPaymentsCents: 120000n, paymentCents: 100000n });
    expect(cumulativeModelo130(year, 4)).toMatchObject({ previousPaymentsCents: 220000n, paymentCents: 0n });
  });

  it("recognises only exact calendar quarters", () => {
    expect(exactQuarter("2026-07-01", "2026-09-30")).toEqual({ year: 2026, quarter: 3 });
    expect(exactQuarter("2026-10-01", "2026-12-31")).toEqual({ year: 2026, quarter: 4 });
    expect(exactQuarter("2026-01-01", "2026-06-30")).toBeNull();
    expect(exactQuarter("2026-07-01", "2026-09-29")).toBeNull();
  });
});
