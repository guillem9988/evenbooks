import { afterAll, describe, expect, it } from "vitest";
import { InvoiceStatus } from "../../generated/prisma/client.js";
import { loadConfig } from "../config.js";
import { createDatabase } from "../lib/prisma.js";
import { buildServer } from "../server.js";
import { openSession, withSession } from "../test/session.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildServer(config);
const session = await openSession(app, "billing");
const inject = withSession(app, session.cookie);

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("issued invoices, quotes, and tax preview", { timeout: 35000 }, () => {
  it("stores a 21% line in cents, sums two rates, and refuses a second quote conversion", async () => {
    const created = await inject({
      method: "POST",
      url: "/organizations",
      payload: { legalName: "Billing SL", taxId: "B20000001" },
    });
    const organizationId = (created.json() as { id: string }).id;
    const contact = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/contacts`,
      payload: { legalName: "Client SL", taxId: "B20000002", email: "client@example.com", role: "CLIENT" },
    });
    expect(contact.statusCode).toBe(201);
    const contactId = (contact.json() as { id: string }).id;

    const issued = await inject({
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

    await inject({
      method: "POST",
      url: `/organizations/${organizationId}/issued-invoices`,
      payload: {
        contactId,
        invoiceDate: "2026-03-11",
        seriesNumber: "F-2",
        lines: [{ description: "Llibres", quantity: 1, unitAmountCents: "5000", taxRate: 10 }],
      },
    });
    const preview = await inject({
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

    const trend = await inject({ method: "GET", url: `/organizations/${organizationId}/dashboard/trend?months=3&to=2026-03-31` });
    expect(trend.statusCode).toBe(200);
    expect((trend.json() as { months: Array<{ month: string; incomeCents: string }> }).months).toEqual([
      { month: "2026-01", incomeCents: "0", expenseCents: "0" },
      { month: "2026-02", incomeCents: "0", expenseCents: "0" },
      { month: "2026-03", incomeCents: "15000", expenseCents: "0" },
    ]);
    const badTrend = await inject({ method: "GET", url: `/organizations/${organizationId}/dashboard/trend?months=0` });
    expect(badTrend.statusCode).toBe(400);

    const quote = await inject({
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
    const first = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/quotes/${quoteId}/convert`,
      payload: { seriesNumber: "F-3" },
    });
    expect(first.statusCode).toBe(201);
    expect(await database.prisma.issuedInvoice.count({ where: { organizationId, seriesNumber: "F-3" } })).toBe(1);
    const second = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/quotes/${quoteId}/convert`,
      payload: { seriesNumber: "F-4" },
    });
    expect(second.statusCode).toBe(409);
    expect(await database.prisma.issuedInvoice.count({ where: { organizationId, seriesNumber: "F-4" } })).toBe(0);

    await database.prisma.organization.delete({ where: { id: organizationId } });
  });

  it("round-trips a catalog item, renders a PDF, and rectifies once", async () => {
    const created = await inject({
      method: "POST",
      url: "/organizations",
      payload: { legalName: "PDF SL", taxId: "B30000001" },
    });
    const organizationId = (created.json() as { id: string }).id;
    const contact = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/contacts`,
      payload: { legalName: "Client PDF", taxId: "B30000002", email: "pdf@example.com", role: "CLIENT" },
    });
    const contactId = (contact.json() as { id: string }).id;

    const catalog = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/catalog`,
      payload: { name: "Hora", unitAmountCents: "10000", taxRate: 21 },
    });
    expect(catalog.statusCode).toBe(201);
    const itemId = (catalog.json() as { id: string }).id;
    const listed = await inject({ method: "GET", url: `/organizations/${organizationId}/catalog` });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { items: Array<{ id: string; unitAmountCents: string }> }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: itemId, unitAmountCents: "10000", taxRate: 21 })]),
    );

    const issued = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/issued-invoices`,
      payload: {
        contactId,
        invoiceDate: "2026-03-10",
        seriesNumber: "F-PDF",
        lines: [{ description: "Servei", quantity: 1, unitAmountCents: "10000", taxRate: 21 }],
      },
    });
    expect(issued.statusCode).toBe(201);
    const invoiceId = (issued.json() as { id: string }).id;
    const stored = await database.prisma.issuedInvoice.findFirstOrThrow({ where: { id: invoiceId } });
    expect(stored.baseAmountCents).toBe(10000n);
    expect(stored.taxAmountCents).toBe(2100n);
    expect(stored.totalAmountCents).toBe(12100n);

    const pdf = await inject({
      method: "GET",
      url: `/organizations/${organizationId}/issued-invoices/${invoiceId}.pdf`,
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.rawPayload.toString("latin1")).not.toMatch(/10000|2100|12100/);

    const rectified = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/issued-invoices/${invoiceId}/rectify`,
    });
    expect(rectified.statusCode).toBe(201);
    const credit = rectified.json() as { id: string; seriesNumber: string; rectifiesSeriesNumber: string; totalAmountCents: string };
    expect(credit.seriesNumber).toBe("F-PDF-R");
    expect(credit.rectifiesSeriesNumber).toBe("F-PDF");
    const creditRow = await database.prisma.issuedInvoice.findFirstOrThrow({ where: { id: credit.id } });
    expect(creditRow.baseAmountCents).toBe(-10000n);
    expect(creditRow.taxAmountCents).toBe(-2100n);
    expect(creditRow.totalAmountCents).toBe(-12100n);

    const again = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/issued-invoices/${invoiceId}/rectify`,
    });
    expect(again.statusCode).toBe(409);
    const nested = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/issued-invoices/${credit.id}/rectify`,
    });
    expect(nested.statusCode).toBe(400);

    await database.prisma.organization.delete({ where: { id: organizationId } });
  });

  it("generates one recurring invoice per month and keeps strangers out", async () => {
    const created = await inject({
      method: "POST",
      url: "/organizations",
      payload: { legalName: "Recurrent SL", taxId: "B40000001" },
    });
    const organizationId = (created.json() as { id: string }).id;
    const contact = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/contacts`,
      payload: { legalName: "Client Rec", taxId: "B40000002", email: "rec@example.com", role: "CLIENT" },
    });
    const contactId = (contact.json() as { id: string }).id;
    const series = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/recurring-invoices`,
      payload: {
        contactId,
        dayOfMonth: 5,
        lines: [{ description: "Quota", quantity: 1, unitAmountCents: "10000", taxRate: 21 }],
      },
    });
    expect(series.statusCode).toBe(201);
    const first = await inject({ method: "POST", url: `/organizations/${organizationId}/recurring-invoices/run` });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { created: unknown[] }).created).toHaveLength(1);
    expect(await database.prisma.issuedInvoice.count({ where: { organizationId, recurringInvoiceId: { not: null } } })).toBe(1);
    const second = await inject({ method: "POST", url: `/organizations/${organizationId}/recurring-invoices/run` });
    expect((second.json() as { created: unknown[] }).created).toHaveLength(0);
    expect(await database.prisma.issuedInvoice.count({ where: { organizationId, recurringInvoiceId: { not: null } } })).toBe(1);

    const wrong = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "wrong-pass" },
    });
    expect(wrong.statusCode).toBe(401);

    const stranger = await openSession(app, "stranger");
    const denied = await withSession(app, stranger.cookie)({
      method: "POST",
      url: `/organizations/${organizationId}/catalog`,
      payload: { name: "Aliè", unitAmountCents: "100", taxRate: 21 },
    });
    expect(denied.statusCode).toBe(403);
    const allowed = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/catalog`,
      payload: { name: "Hora", unitAmountCents: "350", taxRate: 21 },
    });
    expect(allowed.statusCode).toBe(201);

    await database.prisma.organization.delete({ where: { id: organizationId } });
    await database.prisma.organization.delete({ where: { id: stranger.organizationId } });
  });

  it("previews modelo 130 as 20% of a positive net and zero on a loss", async () => {
    const created = await inject({
      method: "POST",
      url: "/organizations",
      payload: { legalName: "Model 130 SL", taxId: "B13000001" },
    });
    const organizationId = (created.json() as { id: string }).id;
    const contact = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/contacts`,
      payload: { legalName: "Client 130", taxId: "B13000002", email: "130@example.com", role: "CLIENT" },
    });
    const contactId = (contact.json() as { id: string }).id;
    await database.prisma.issuedInvoice.create({
      data: {
        organizationId,
        contactId,
        seriesNumber: "130-1",
        invoiceDate: new Date("2026-02-01T00:00:00.000Z"),
        baseAmountCents: 82645n,
        taxAmountCents: 17355n,
        totalAmountCents: 100000n,
      },
    });
    await database.prisma.invoice.create({
      data: {
        organizationId,
        storageKey: "130-expense",
        originalFilename: "despesa.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 10,
        status: InvoiceStatus.PARSED,
        invoiceDate: new Date("2026-02-02T00:00:00.000Z"),
        totalAmountCents: 40000n,
      },
    });
    const preview = await inject({
      method: "GET",
      url: `/organizations/${organizationId}/taxes/130?from=2026-01-01&to=2026-03-31`,
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json() as {
      disclaimer: string;
      incomeCents: string;
      expenseCents: string;
      netCents: string;
      rate: string;
      paymentCents: string;
    };
    expect(body.disclaimer).toMatch(/not an AEAT filing/);
    // Income is the base without VAT; the expense has no breakdown, so its total counts as net.
    expect(body.incomeCents).toBe("82645");
    expect(body.expenseCents).toBe("40000");
    expect(body.netCents).toBe("42645");
    expect(body.rate).toBe("0.20");
    expect(body.paymentCents).toBe("8529");

    await database.prisma.issuedInvoice.create({
      data: {
        organizationId,
        contactId,
        seriesNumber: "130-R",
        invoiceDate: new Date("2026-05-01T00:00:00.000Z"),
        baseAmountCents: -200000n,
        taxAmountCents: 0n,
        totalAmountCents: -200000n,
      },
    });
    const loss = await inject({
      method: "GET",
      url: `/organizations/${organizationId}/taxes/130?from=2026-01-01&to=2026-06-30`,
    });
    expect((loss.json() as { netCents: string; paymentCents: string }).netCents).toBe("-157355");
    expect((loss.json() as { paymentCents: string }).paymentCents).toBe("0");

    await database.prisma.organization.delete({ where: { id: organizationId } });
  });

  it("updates and deletes quotes, issued invoices, and recurring invoices", { timeout: 45000 }, async () => {
    const orgRes = await inject({
      method: "POST",
      url: "/organizations",
      payload: { legalName: "Crud SL", taxId: "B50000001" },
    });
    const organizationId = (orgRes.json() as { id: string }).id;
    const contactRes = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/contacts`,
      payload: { legalName: "Client Crud", taxId: "B50000002", email: "crud@example.com", role: "CLIENT" },
    });
    const contactId = (contactRes.json() as { id: string }).id;

    // 1. Quote creation and edit (PATCH)
    const quoteRes = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/quotes`,
      payload: {
        contactId,
        quoteDate: "2026-05-01",
        seriesNumber: "P-EDIT-1",
        lines: [{ description: "Initial", quantity: 1, unitAmountCents: "5000", taxRate: 21 }],
      },
    });
    expect(quoteRes.statusCode).toBe(201);
    const quoteId = (quoteRes.json() as { id: string }).id;

    const patchQuoteRes = await inject({
      method: "PATCH",
      url: `/organizations/${organizationId}/quotes/${quoteId}`,
      payload: {
        seriesNumber: "P-EDIT-MODIFIED",
        lines: [{ description: "Modified", quantity: 2, unitAmountCents: "10000", taxRate: 21 }],
      },
    });
    expect(patchQuoteRes.statusCode).toBe(200);
    const patchedQuote = patchQuoteRes.json() as { seriesNumber: string; totalAmountCents: string };
    expect(patchedQuote.seriesNumber).toBe("P-EDIT-MODIFIED");
    expect(patchedQuote.totalAmountCents).toBe("24200"); // 2 * 100 + 21% = 242

    // 2. Convert quote to invoice
    const convertRes = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/quotes/${quoteId}/convert`,
      payload: { seriesNumber: "F-CONV-1" },
    });
    expect(convertRes.statusCode).toBe(201);
    const invoiceId = (convertRes.json() as { id: string }).id;

    // Quote is now converted: edit and delete must be rejected (409)
    const badEditQuote = await inject({
      method: "PATCH",
      url: `/organizations/${organizationId}/quotes/${quoteId}`,
      payload: { seriesNumber: "P-EDIT-FAIL" },
    });
    expect(badEditQuote.statusCode).toBe(409);

    const badDeleteQuote = await inject({
      method: "DELETE",
      url: `/organizations/${organizationId}/quotes/${quoteId}`,
    });
    expect(badDeleteQuote.statusCode).toBe(409);

    // 3. Delete issued invoice -> should restore quote back to OPEN
    const deleteInvoiceRes = await inject({
      method: "DELETE",
      url: `/organizations/${organizationId}/issued-invoices/${invoiceId}`,
    });
    expect(deleteInvoiceRes.statusCode).toBe(200);

    const restoredQuote = await database.prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(restoredQuote.status).toBe("OPEN");
    expect(restoredQuote.issuedInvoiceId).toBeNull();

    // Now that quote is OPEN again, deleting it succeeds
    const deleteQuoteRes = await inject({
      method: "DELETE",
      url: `/organizations/${organizationId}/quotes/${quoteId}`,
    });
    expect(deleteQuoteRes.statusCode).toBe(200);

    // 4. Recurring invoice: create, patch, run, delete
    const recurRes = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/recurring-invoices`,
      payload: {
        contactId,
        dayOfMonth: 10,
        lines: [{ description: "Monthly base", quantity: 1, unitAmountCents: "3000", taxRate: 21 }],
      },
    });
    expect(recurRes.statusCode).toBe(201);
    const seriesId = (recurRes.json() as { id: string }).id;

    const patchRecurRes = await inject({
      method: "PATCH",
      url: `/organizations/${organizationId}/recurring-invoices/${seriesId}`,
      payload: {
        dayOfMonth: 15,
        lines: [{ description: "Monthly updated", quantity: 2, unitAmountCents: "4000", taxRate: 21 }],
      },
    });
    expect(patchRecurRes.statusCode).toBe(200);
    const patchedRecur = patchRecurRes.json() as { dayOfMonth: number };
    expect(patchedRecur.dayOfMonth).toBe(15);

    const deleteRecurRes = await inject({
      method: "DELETE",
      url: `/organizations/${organizationId}/recurring-invoices/${seriesId}`,
    });
    expect(deleteRecurRes.statusCode).toBe(200);

    const checkRecurDeleted = await database.prisma.recurringInvoice.findUnique({ where: { id: seriesId } });
    expect(checkRecurDeleted).toBeNull();

    await database.prisma.organization.delete({ where: { id: organizationId } });
  });
});
