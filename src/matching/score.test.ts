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
    baseAmountCents: 10000n,
    totalAmountCents: 12100n,
    ...overrides,
  };
}

describe("scorePair", () => {
  it("auto-confirms an exact cent amount with vendor, tax id, and a short date gap", () => {
    const scored = scorePair(transaction(), invoice());
    expect(scored.breakdown.amount.exact).toBe(true);
    expect(scored.breakdown.amount.transactionCents).toBe("-12100");
    expect(scored.breakdown.vendor.nifMatched).toBe(true);
    expect(scored.breakdown.weights).toEqual({
      amount: "0.4500",
      date: "0.2000",
      text: "0.2000",
      vendor: "0.1500",
    });
    expect(scored.autoConfirm).toBe(true);
    expect(scored.confidenceScore).toMatch(/^0\.\d{4}$|^1\.0000$/);
    expect(typeof scored.confidencePoints).toBe("number");
    expect(Number.isInteger(scored.confidencePoints)).toBe(true);
  });

  it("scores a two-cent gap at 0.90 and an exact base amount at 0.85", () => {
    const near = scorePair(transaction({ amountCents: -12102n }), invoice());
    expect(near.breakdown.amount.exact).toBe(false);
    expect(near.breakdown.amount.score).toBe("0.9000");
    const base = scorePair(transaction({ amountCents: -10000n }), invoice());
    expect(base.breakdown.amount.score).toBe("0.8500");
  });

  it("scores the Amazon card descriptor above 0.85", () => {
    const scored = scorePair(
      transaction({
        amountCents: -12100n,
        rawDescription: "AMZ MKT 49102",
        transactionDate: day("2026-05-14"),
      }),
      invoice({
        vendorName: "Amazon Web Services Spain SL",
        vendorTaxId: null,
        invoiceNumber: null,
        invoiceDate: day("2026-05-12"),
        totalAmountCents: 12100n,
        baseAmountCents: null,
      }),
    );
    expect(Number(scored.confidenceScore)).toBeGreaterThan(0.85);
    expect(typeof scored.breakdown.amount.transactionCents).toBe("string");
  });

  it("refuses a currency mismatch even when the cents are equal", () => {
    const scored = scorePair(transaction({ currency: "USD" }), invoice());
    expect(scored.breakdown.currencyCompatible).toBe(false);
    expect(scored.autoConfirm).toBe(false);
  });
});

describe("assignMatches", () => {
  it("does not give one transaction to two invoices of the same amount and vendor", () => {
    const shared = {
      amountCents: -5000n,
      rawDescription: "BETA STUDIO",
      transactionDate: day("2026-03-12"),
    };
    const first = scorePair(transaction({ id: "tx", ...shared }), invoice({ id: "inv-a", vendorName: "Beta Studio", vendorTaxId: null, totalAmountCents: 5000n, baseAmountCents: 5000n }));
    const second = scorePair(transaction({ id: "tx", ...shared }), invoice({ id: "inv-b", vendorName: "Beta Studio", vendorTaxId: null, totalAmountCents: 5000n, baseAmountCents: 5000n }));
    const assignment = assignMatches([first, second]);
    const chosen = [...assignment.confirmed, ...assignment.suggestions];
    expect(chosen).toHaveLength(1);
    expect(new Set(chosen.map((pair) => pair.transactionId)).size).toBe(1);
  });

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
