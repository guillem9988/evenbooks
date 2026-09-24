import { afterAll, describe, expect, it } from "vitest";
import { InvoiceStatus, MatchStatus } from "../../generated/prisma/client.js";
import { createDatabase } from "../lib/prisma.js";
import { loadConfig } from "../config.js";
import { reconcileOrganization } from "./reconcile.js";
import { trigramSimilarity } from "./trigram.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

afterAll(async () => {
  await database.close();
});

describe("reconcileOrganization", () => {
  it("persists an auto-confirmed match and leaves a weak pair unmatched", async () => {
    const organization = await database.prisma.organization.create({
      data: { legalName: "Matcher Test SL", taxId: "B00000000" },
    });
    const statement = await database.prisma.bankStatement.create({
      data: {
        organizationId: organization.id,
        filename: "movements.csv",
        totalTransactions: 2,
      },
    });

    const confirmedTx = await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-03-12T00:00:00.000Z"),
        valueDate: new Date("2026-03-12T00:00:00.000Z"),
        amountCents: -12100n,
        rawDescription: "ADEUDO SEPA FACTURA F2024-15 ACME SL B12345678",
      },
    });
    const unmatchedTx = await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-01-02T00:00:00.000Z"),
        valueDate: new Date("2026-01-02T00:00:00.000Z"),
        amountCents: -100n,
        rawDescription: "CAFE",
      },
    });
    await database.prisma.invoice.create({
      data: {
        organizationId: organization.id,
        storageKey: "invoices/acme.pdf",
        originalFilename: "acme.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1200,
        status: InvoiceStatus.PARSED,
        vendorName: "Acme S.L.",
        vendorTaxId: "B12345678",
        invoiceNumber: "F2024-15",
        invoiceDate: new Date("2026-03-10T00:00:00.000Z"),
        totalAmountCents: 12100n,
      },
    });

    const first = await reconcileOrganization(database.prisma, organization.id);
    const second = await reconcileOrganization(database.prisma, organization.id);

    expect(first.confirmed).toHaveLength(1);
    expect(first.confirmed[0]?.transactionId).toBe(confirmedTx.id);
    expect(second.confirmed).toHaveLength(0);

    const stored = await database.prisma.bankTransaction.findUniqueOrThrow({
      where: { id: confirmedTx.id },
    });
    const stillOpen = await database.prisma.bankTransaction.findUniqueOrThrow({
      where: { id: unmatchedTx.id },
    });
    expect(stored.matchStatus).toBe(MatchStatus.AUTO_MATCHED);
    expect(stillOpen.matchStatus).toBe(MatchStatus.UNMATCHED);

    const match = await database.prisma.reconciliationMatch.findUniqueOrThrow({
      where: { transactionId: confirmedTx.id },
    });
    expect(match.isAutoConfirmed).toBe(true);
    expect(match.confidenceScore.toFixed(4)).toBe(first.confirmed[0]?.confidenceScore);

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });

  it("matches pg_trgm similarity on folded ASCII text", async () => {
    const rows = await database.prisma.$queryRaw<Array<{ score: number }>>`
      SELECT similarity('acme sl', 'acme sl') AS score
    `;
    const postgres = rows[0]?.score;
    expect(postgres).toBeTypeOf("number");
    expect(trigramSimilarity("acme sl", "acme sl")).toBeCloseTo(Number(postgres), 5);

    const partial = await database.prisma.$queryRaw<Array<{ score: number }>>`
      SELECT similarity('acme servicios', 'acme sl') AS score
    `;
    expect(trigramSimilarity("acme servicios", "acme sl")).toBeCloseTo(Number(partial[0]?.score), 2);
  });
});
