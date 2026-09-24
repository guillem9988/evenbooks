import { afterAll, describe, expect, it } from "vitest";
import { InvoiceStatus, MatchStatus } from "../../generated/prisma/client.js";
import { loadConfig } from "../config.js";
import { createDatabase } from "../lib/prisma.js";
import { buildServer } from "../server.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildServer(config);

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("reconciliation review", () => {
  it("creates an organization and lists an unstored suggestion", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/organizations",
      payload: { legalName: "Review Desk SL", taxId: "B11223344" },
    });
    expect(created.statusCode).toBe(201);
    const organization = created.json() as { id: string; legalName: string; taxId: string };
    expect(organization.legalName).toBe("Review Desk SL");

    const missing = await app.inject({
      method: "GET",
      url: "/organizations/00000000-0000-4000-8000-000000000099/reconciliation/review",
    });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({
      method: "GET",
      url: "/organizations/not-a-uuid/reconciliation/review",
    });
    expect(bad.statusCode).toBe(400);

    const statement = await database.prisma.bankStatement.create({
      data: { organizationId: organization.id, filename: "movements.csv" },
    });
    const transaction = await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-04-01T00:00:00.000Z"),
        valueDate: new Date("2026-04-01T00:00:00.000Z"),
        amountCents: -5000n,
        rawDescription: "BETA STUDIO",
      },
    });
    const invoice = await database.prisma.invoice.create({
      data: {
        organizationId: organization.id,
        storageKey: "invoices/beta.pdf",
        originalFilename: "beta.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 40,
        status: InvoiceStatus.PARSED,
        vendorName: "Beta Studio",
        invoiceDate: new Date("2026-03-20T00:00:00.000Z"),
        totalAmountCents: 5000n,
        baseAmountCents: 4132n,
      },
    });

    const review = await app.inject({
      method: "GET",
      url: `/organizations/${organization.id}/reconciliation/review`,
    });
    expect(review.statusCode).toBe(200);
    const body = review.json() as {
      suggestions: Array<{
        confidenceScore: string;
        breakdown: { weights: { amount: string } };
        transaction: { id: string; amountCents: string };
        invoice: { id: string; vendorName: string };
      }>;
    };
    expect(body.suggestions).toHaveLength(1);
    const suggestion = body.suggestions[0];
    expect(suggestion).toBeDefined();
    const score = Number(suggestion?.confidenceScore);
    expect(score).toBeGreaterThanOrEqual(0.65);
    expect(score).toBeLessThan(0.88);
    expect(suggestion?.breakdown.weights.amount).toBe("0.4500");
    expect(suggestion?.transaction.id).toBe(transaction.id);
    expect(suggestion?.transaction.amountCents).toBe("-5000");
    expect(suggestion?.invoice.vendorName).toBe("Beta Studio");
    expect(
      await database.prisma.reconciliationMatch.count({ where: { invoiceId: invoice.id } }),
    ).toBe(0);

    const confirmed = await app.inject({
      method: "POST",
      url: `/organizations/${organization.id}/reconciliation/matches`,
      payload: { transactionId: transaction.id, invoiceId: invoice.id },
    });
    expect(confirmed.statusCode).toBe(201);
    const match = confirmed.json() as { id: string; matchStatus: string };
    expect(match.matchStatus).toBe(MatchStatus.MANUALLY_MATCHED);

    const again = await app.inject({
      method: "POST",
      url: `/organizations/${organization.id}/reconciliation/matches`,
      payload: { transactionId: transaction.id, invoiceId: invoice.id },
    });
    expect(again.statusCode).toBe(409);

    const rejected = await app.inject({
      method: "POST",
      url: `/organizations/${organization.id}/reconciliation/matches/${match.id}/reject`,
    });
    expect(rejected.statusCode).toBe(200);
    const after = await database.prisma.bankTransaction.findUniqueOrThrow({ where: { id: transaction.id } });
    expect(after.matchStatus).toBe(MatchStatus.UNMATCHED);
    expect(await database.prisma.reconciliationMatch.findUnique({ where: { id: match.id } })).toBeNull();

    const badMatch = await app.inject({
      method: "POST",
      url: `/organizations/${organization.id}/reconciliation/matches`,
      payload: { transactionId: "nope", invoiceId: invoice.id },
    });
    expect(badMatch.statusCode).toBe(400);

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });
});
