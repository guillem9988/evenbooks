import { describe, expect, it } from "vitest";
import { computeDocument, groupByRate } from "./lines.js";

describe("computeDocument", () => {
  it("stores a 100.00 EUR line at 21% as 10000, 2100, and 12100 cents", () => {
    const document = computeDocument([
      { description: "Servei", quantity: 1, unitAmountCents: 10000n, taxRate: 21 },
    ]);
    expect(document.baseAmountCents).toBe(10000n);
    expect(document.taxAmountCents).toBe(2100n);
    expect(document.totalAmountCents).toBe(12100n);
    expect(typeof document.totalAmountCents).toBe("bigint");
  });
});

describe("groupByRate", () => {
  it("sums two rates with integer cents", () => {
    const grouped = groupByRate([
      { rate: 21, baseCents: 10000n, taxCents: 2100n },
      { rate: 10, baseCents: 5000n, taxCents: 500n },
      { rate: 21, baseCents: 2000n, taxCents: 420n },
    ]);
    expect(grouped).toEqual([
      { rate: 21, baseCents: 12000n, taxCents: 2520n },
      { rate: 10, baseCents: 5000n, taxCents: 500n },
    ]);
    expect(grouped.every((row) => typeof row.baseCents === "bigint" && typeof row.taxCents === "bigint")).toBe(true);
  });
});
