import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { InvoiceStatus, MatchStatus, Prisma } from "../../generated/prisma/client.js";
import { loadConfig } from "../config.js";
import { createDatabase } from "../lib/prisma.js";
import { buildAccountantExport } from "./accountant-export.js";

const database = createDatabase(loadConfig().databaseUrl);
const objects = new Map<string, Buffer>();

afterAll(async () => {
  await database.close();
});

describe("buildAccountantExport", () => {
  it("packs a matched expense, lists an unmatched expense, and omits transactions outside the range", async () => {
    const organization = await database.prisma.organization.create({
      data: { legalName: "Export Test SL", taxId: "B00000005" },
    });
    const statement = await database.prisma.bankStatement.create({
      data: { organizationId: organization.id, filename: "q1.csv", totalTransactions: 3 },
    });
    const matchedTx = await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-03-12T00:00:00.000Z"),
        valueDate: new Date("2026-03-12T00:00:00.000Z"),
        amountCents: -12100n,
        rawDescription: "ACME SL",
        matchStatus: MatchStatus.AUTO_MATCHED,
      },
    });
    const openTx = await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-03-20T00:00:00.000Z"),
        valueDate: new Date("2026-03-20T00:00:00.000Z"),
        amountCents: -500n,
        rawDescription: "Cafe sense tiquet",
      },
    });
    await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-04-02T00:00:00.000Z"),
        valueDate: new Date("2026-04-02T00:00:00.000Z"),
        amountCents: -999n,
        rawDescription: "Outside quarter",
      },
    });
    const invoice = await database.prisma.invoice.create({
      data: {
        organizationId: organization.id,
        storageKey: `invoices/${organization.id}/acme.pdf`,
        originalFilename: "acme.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 4,
        status: InvoiceStatus.PARSED,
        vendorName: "Acme S.L.",
        invoiceNumber: "F2024-15",
        invoiceDate: new Date("2026-03-10T00:00:00.000Z"),
        baseAmountCents: 10000n,
        taxAmountCents: 2100n,
        totalAmountCents: 12100n,
        taxRate: "GENERAL_21",
      },
    });
    await database.prisma.reconciliationMatch.create({
      data: {
        organizationId: organization.id,
        transactionId: matchedTx.id,
        invoiceId: invoice.id,
        confidenceScore: new Prisma.Decimal("0.9100"),
        isAutoConfirmed: true,
        matchingBreakdown: { amount: { exact: true } },
      },
    });
    objects.set(invoice.storageKey, Buffer.from("%PDF"));

    const archive = await buildAccountantExport(database.prisma, { get: async (key) => {
      const body = objects.get(key);
      if (body === undefined) throw new Error("missing");
      return body;
    } }, organization.id, "2026-03-01", "2026-03-31");

    const zip = await JSZip.loadAsync(archive.body);
    const csv = await zip.file("resum_trimestral.csv")?.async("string");
    const anomalies = await zip.file("anomalies_sense_justificant.txt")?.async("string");
    const factureNames = Object.keys(zip.files).filter((name) => name.startsWith("factures/") && !zip.files[name]?.dir);

    expect(csv).toContain("ACME SL");
    expect(csv).toContain("-12100");
    expect(csv).toContain("-121.00");
    expect(csv).toContain("F2024-15");
    expect(csv).toContain("0.9100");
    expect(csv).not.toContain("Outside quarter");
    expect(factureNames).toHaveLength(1);
    expect(factureNames[0]).toBe(`factures/20260310_Acme_S_L_121.00_${invoice.id}.pdf`);
    expect(anomalies).toContain("2026-03-20 -5.00 EUR Cafe sense tiquet");
    expect(anomalies).not.toContain("ACME SL");
    expect(zip.files[`factures/${openTx.id}`]).toBeUndefined();

    await database.prisma.organization.delete({ where: { id: organization.id } });
  }, 25000);
});
