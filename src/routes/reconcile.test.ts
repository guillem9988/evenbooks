import { afterAll, describe, expect, it } from "vitest";
import { InvoiceStatus } from "../../generated/prisma/client.js";
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

describe("POST /organizations/:organizationId/reconcile", () => {
  it("returns 400 for a bad id, 404 for a missing organization, and confirmed matches for a real one", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/organizations/not-a-uuid/reconcile",
    });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: "/organizations/00000000-0000-4000-8000-000000000000/reconcile",
    });
    expect(missing.statusCode).toBe(404);

    const organization = await database.prisma.organization.create({
      data: { legalName: "Route Test SL", taxId: "B00000001" },
    });
    const statement = await database.prisma.bankStatement.create({
      data: { organizationId: organization.id, filename: "movements.csv" },
    });
    await database.prisma.bankTransaction.create({
      data: {
        statementId: statement.id,
        organizationId: organization.id,
        transactionDate: new Date("2026-03-12T00:00:00.000Z"),
        valueDate: new Date("2026-03-12T00:00:00.000Z"),
        amountCents: -12100n,
        rawDescription: "ADEUDO SEPA FACTURA F2024-15 ACME SL B12345678",
      },
    });
    await database.prisma.invoice.create({
      data: {
        organizationId: organization.id,
        storageKey: "invoices/acme.pdf",
        originalFilename: "acme.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 800,
        status: InvoiceStatus.PARSED,
        vendorName: "Acme S.L.",
        vendorTaxId: "B12345678",
        invoiceNumber: "F2024-15",
        invoiceDate: new Date("2026-03-10T00:00:00.000Z"),
        totalAmountCents: 12100n,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/organizations/${organization.id}/reconcile`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { confirmed: Array<{ confidenceScore: string }>; suggestions: unknown[] };
    expect(body.confirmed).toHaveLength(1);
    expect(body.confirmed[0]?.confidenceScore).toMatch(/^\d\.\d{4}$/);
    expect(body.suggestions).toEqual([]);

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });
});
