import { describe, expect, it } from "vitest";
import { addCents, formatCents, formatEuroDisplay, parseEurosToCents } from "./money.js";

describe("money", () => {
  it("keeps euro amounts as integer cents instead of floats", () => {
    expect(parseEurosToCents("19.99")).toBe(1999n);
    expect(typeof parseEurosToCents("19.99")).toBe("bigint");

    const sum = addCents(parseEurosToCents("0.10"), parseEurosToCents("0.20"));
    expect(sum).toBe(30n);
    expect(formatCents(sum)).toBe("0.30");
    expect(formatCents(parseEurosToCents("-1500.50"))).toBe("-1500.50");

    // Binary floats cannot represent these decimals. 19.99 * 100 is
    // 1998.9999999999998, and 0.1 + 0.2 is not 0.3.
    expect(19.99 * 100).not.toBe(1999);
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(() => addCents(19.99 as unknown as bigint, 1n)).toThrow(/bigint/);
  });

  it("shows euros with a decimal comma and the euro sign", () => {
    expect(formatEuroDisplay(350n)).toBe("3,50 €");
    expect(formatEuroDisplay(12100n)).toBe("121,00 €");
    expect(formatEuroDisplay(-12100n)).toBe("-121,00 €");
  });
});
