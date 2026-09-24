import { describe, expect, it } from "vitest";
import { assignMatches } from "./assign.js";
import { scorePair } from "./score.js";
import type { MatchInvoice, MatchTransaction } from "./score.js";

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

function transaction(overrides: Partial<MatchTransaction> = {}): MatchTransaction {
  return {
    id: "tx-1",
    amountCents: -12100n,
    currency: "EUR",
    transactionDate: day("2026-03-12"),
    rawDescription: "ADEUDO SEPA FACTURA F2024-15 ACME SL B12345678",
    normalizedMerchant: null,
    ...overrides,
  };
}

function invoice(overrides: Partial<MatchInvoice> = {}): MatchInvoice {
  return {
    id: "inv-1",
    vendorName: "Acme S.L.",
    vendorTaxId: "ES B-12345678",
    invoiceNumber: "F2024-15",
    invoiceDate: day("2026-03-10"),
    currency: "EUR",
    totalAmountCents: 12100n,
    ...overrides,
  };
}

describe("scorePair", () => {
  it("auto-confirms an exact cent amount with vendor, tax id, and a short date gap", () => {
    const scored = scorePair(transaction(), invoice());
    expect(scored.breakdown.amount.exact).toBe(true);
    expect(scored.breakdown.amount.transactionCents).toBe("-12100");
    expect(scored.breakdown.taxId.matched).toBe(true);
    expect(scored.autoConfirm).toBe(true);
    expect(scored.confidenceScore).toMatch(/^0\.\d{4}$|^1\.0000$/);
    expect(typeof scored.confidencePoints).toBe("number");
    expect(Number.isInteger(scored.confidencePoints)).toBe(true);
  });

  it("does not treat a one-cent difference as an amount match", () => {
    const scored = scorePair(transaction({ amountCents: -12101n }), invoice());
    expect(scored.breakdown.amount.exact).toBe(false);
    expect(scored.breakdown.amount.points).toBe(0);
    expect(scored.autoConfirm).toBe(false);
  });

  it("refuses a currency mismatch even when the cents are equal", () => {
    const scored = scorePair(transaction({ currency: "USD" }), invoice());
    expect(scored.breakdown.currencyCompatible).toBe(false);
    expect(scored.autoConfirm).toBe(false);
  });
});

describe("assignMatches", () => {
  it("gives one invoice to the stronger transaction and keeps the other as a suggestion only if it has its own invoice", () => {
    const strong = scorePair(transaction({ id: "tx-strong" }), invoice({ id: "inv-a" }));
    const weakSameInvoice = scorePair(
      transaction({
        id: "tx-weak",
        rawDescription: "ACME",
        transactionDate: day("2026-04-20"),
      }),
      invoice({ id: "inv-a", vendorTaxId: null, invoiceNumber: null, invoiceDate: day("2026-03-01") }),
    );
    const other = scorePair(
      transaction({
        id: "tx-other",
        amountCents: -5000n,
        rawDescription: "BETA STUDIO B87654321 FACTURA B-9",
      }),
      invoice({
        id: "inv-b",
        vendorName: "Beta Studio",
        vendorTaxId: "B87654321",
        invoiceNumber: "B-9",
        totalAmountCents: 5000n,
      }),
    );

    const assignment = assignMatches([weakSameInvoice, other, strong]);
    expect(assignment.confirmed.map((pair) => pair.transactionId).sort()).toEqual(["tx-other", "tx-strong"]);
    expect(assignment.suggestions.some((pair) => pair.transactionId === "tx-weak")).toBe(false);
    expect(assignment.confirmed.some((pair) => pair.invoiceId === "inv-a" && pair.transactionId === "tx-weak")).toBe(
      false,
    );
  });
});
