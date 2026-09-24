import { afterAll, describe, expect, it } from "vitest";
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

describe("issued invoices, quotes, and tax preview", () => {
  it("stores a 21% line in cents, sums two rates, and refuses a second quote conversion", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/organizations",
      payload: { legalName: "Billing SL", taxId: "B20000001" },
    });
    const organizationId = (created.json() as { id: string }).id;
    const contact = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/contacts`,
      payload: { legalName: "Client SL", taxId: "B20000002", email: "client@example.com", role: "CLIENT" },
    });
    expect(contact.statusCode).toBe(201);
    const contactId = (contact.json() as { id: string }).id;

    const issued = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/issued-invoices`,
      payload: {
        contactId,
        invoiceDate: "2026-03-10",
        seriesNumber: "F-1",
        lines: [{ description: "Servei", quantity: 1, unitAmountCents: "10000", taxRate: 21 }],
      },
    });
    expect(issued.statusCode).toBe(201);
    const stored = await database.prisma.issuedInvoice.findFirstOrThrow({ where: { organizationId, seriesNumber: "F-1" } });
    expect(stored.baseAmountCents).toBe(10000n);
    expect(stored.taxAmountCents).toBe(2100n);
    expect(stored.totalAmountCents).toBe(12100n);

    await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/issued-invoices`,
      payload: {
        contactId,
        invoiceDate: "2026-03-11",
        seriesNumber: "F-2",
        lines: [{ description: "Llibres", quantity: 1, unitAmountCents: "5000", taxRate: 10 }],
      },
    });
    const preview = await app.inject({
      method: "GET",
      url: `/organizations/${organizationId}/taxes/preview?from=2026-01-01&to=2026-12-31`,
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json() as {
      kind: string;
      disclaimer: string;
      issued: Array<{ rate: number; baseCents: string; taxCents: string }>;
    };
    expect(body.kind).toBe("modelo-303-preview");
    expect(body.disclaimer).toMatch(/not an AEAT filing/);
    const general = body.issued.find((row) => row.rate === 21);
    const reduced = body.issued.find((row) => row.rate === 10);
    expect(BigInt(general?.baseCents ?? "0") + BigInt(reduced?.baseCents ?? "0")).toBe(15000n);
    expect(BigInt(general?.taxCents ?? "0") + BigInt(reduced?.taxCents ?? "0")).toBe(2600n);

    const quote = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/quotes`,
      payload: {
        contactId,
        quoteDate: "2026-04-01",
        seriesNumber: "P-1",
        lines: [{ description: "Pressupost", quantity: 1, unitAmountCents: "10000", taxRate: 21 }],
      },
    });
    const quoteId = (quote.json() as { id: string }).id;
    const first = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/quotes/${quoteId}/convert`,
      payload: { seriesNumber: "F-3" },
    });
    expect(first.statusCode).toBe(201);
    expect(await database.prisma.issuedInvoice.count({ where: { organizationId, seriesNumber: "F-3" } })).toBe(1);
    const second = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/quotes/${quoteId}/convert`,
      payload: { seriesNumber: "F-4" },
    });
    expect(second.statusCode).toBe(409);
    expect(await database.prisma.issuedInvoice.count({ where: { organizationId, seriesNumber: "F-4" } })).toBe(0);

    await database.prisma.organization.delete({ where: { id: organizationId } });
  });
});
