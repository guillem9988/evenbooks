import { afterAll, describe, expect, it } from "vitest";
import { ContactRole, InvoiceStatus, IssuedInvoiceStatus, MatchStatus, Prisma } from "../../generated/prisma/client.js";
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

  it("auto-reconciles positive client payments with issued invoices and marks them PAID", async () => {
    const organization = await database.prisma.organization.create({
      data: { legalName: "Client Match SL", taxId: "B00000088" },
    });
    const contact = await database.prisma.contact.create({
      data: {
        organizationId: organization.id,
        legalName: "Client Fidel SL",
        taxId: "B99112233",
        email: "client@fidel.test",
        role: ContactRole.CLIENT,
      },
    });
    const issuedInvoice = await database.prisma.issuedInvoice.create({
      data: {
        organizationId: organization.id,
        contactId: contact.id,
        seriesNumber: "FAC-2026-099",
        invoiceDate: new Date("2026-03-10T00:00:00.000Z"),
        baseAmountCents: 20000n,
        taxAmountCents: 4200n,
        totalAmountCents: 24200n,
        status: IssuedInvoiceStatus.UNPAID,
      },
    });
    const statement = await database.prisma.bankStatement.create({
      data: {
        organizationId: organization.id,
        filename: "statement_income.csv",
        totalTransactions: 1,
      },
    });
    const incomeTx = await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-03-11T00:00:00.000Z"),
        valueDate: new Date("2026-03-11T00:00:00.000Z"),
        amountCents: 24200n, // +242.00 EUR
        rawDescription: "TRANSF BANCARIA COBRAMENT FAC-2026-099 CLIENT FIDEL SL",
      },
    });

    const result = await reconcileOrganization(database.prisma, organization.id);
    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0]?.transactionId).toBe(incomeTx.id);
    expect(result.confirmed[0]?.issuedInvoiceId).toBe(issuedInvoice.id);
    expect(result.confirmed[0]?.targetType).toBe("ISSUED");

    // Verify bank transaction is AUTO_MATCHED
    const updatedTx = await database.prisma.bankTransaction.findUniqueOrThrow({
      where: { id: incomeTx.id },
    });
    expect(updatedTx.matchStatus).toBe(MatchStatus.AUTO_MATCHED);

    // Verify issued invoice is marked as PAID
    const updatedInvoice = await database.prisma.issuedInvoice.findUniqueOrThrow({
      where: { id: issuedInvoice.id },
    });
    expect(updatedInvoice.status).toBe(IssuedInvoiceStatus.PAID);

    // Verify match record in DB
    const match = await database.prisma.reconciliationMatch.findUniqueOrThrow({
      where: { transactionId: incomeTx.id },
    });
    expect(match.issuedInvoiceId).toBe(issuedInvoice.id);
    expect(match.invoiceId).toBeNull();
    expect(match.isAutoConfirmed).toBe(true);

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });

  it("keeps the unique transaction constraint when two matches are inserted together", async () => {
    const organization = await database.prisma.organization.create({
      data: { legalName: "Unique Match SL", taxId: "B00000009" },
    });
    const statement = await database.prisma.bankStatement.create({
      data: { organizationId: organization.id, filename: "one.csv" },
    });
    const transaction = await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-03-12T00:00:00.000Z"),
        valueDate: new Date("2026-03-12T00:00:00.000Z"),
        amountCents: -5000n,
        rawDescription: "BETA",
      },
    });
    const invoices = await Promise.all(
      ["a", "b"].map((suffix) =>
        database.prisma.invoice.create({
          data: {
            organizationId: organization.id,
            storageKey: `invoices/${organization.id}/${suffix}.pdf`,
            originalFilename: `${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSizeBytes: 10,
            status: InvoiceStatus.PARSED,
            vendorName: "Beta Studio",
            totalAmountCents: 5000n,
          },
        }),
      ),
    );
    const results = await Promise.allSettled(
      invoices.map((invoice) =>
        database.prisma.reconciliationMatch.create({
          data: {
            organizationId: organization.id,
            transactionId: transaction.id,
            invoiceId: invoice.id,
            confidenceScore: new Prisma.Decimal("0.9000"),
            isAutoConfirmed: true,
            matchingBreakdown: { amount: { exact: true } },
          },
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await database.prisma.reconciliationMatch.count({ where: { transactionId: transaction.id } })).toBe(1);
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
