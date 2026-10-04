import { afterAll, describe, expect, it } from "vitest";
import { ExpenseCategory, InvoiceStatus } from "../../generated/prisma/client.js";
import { loadConfig } from "../config.js";
import { createDatabase } from "../lib/prisma.js";
import { buildServer } from "../server.js";
import { openSession, withSession } from "../test/session.js";
import { suggestCategory } from "./categorize.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildServer(config);
const session = await openSession(app, "categories");
const inject = withSession(app, session.cookie);

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("suggestCategory", () => {
  it("reuses the organization's last category for the vendor, then the AI guess, then keyword rules", async () => {
    const organization = await database.prisma.organization.create({ data: { legalName: "Categories SL", taxId: "B00000077" } });
    const expense = (vendorName: string, vendorTaxId: string | null, expenseCategory: ExpenseCategory | null) =>
      database.prisma.invoice.create({
        data: {
          organizationId: organization.id,
          storageKey: "",
          originalFilename: "x.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 0,
          status: InvoiceStatus.PARSED,
          vendorName,
          vendorTaxId,
          totalAmountCents: 1000n,
          expenseCategory,
        },
      });
    await expense("Fusteria Puig SL", "B11111111", ExpenseCategory.OFFICE);
    // Rules would call Repsol TRAVEL, but this person filed it under OTHER: their choice wins.
    await expense("Repsol", null, ExpenseCategory.OTHER);

    const suggest = (input: Parameters<typeof suggestCategory>[2]) => suggestCategory(database.prisma, organization.id, input);
    expect(await suggest({ vendorName: "FUSTERIA PUIG SL", vendorTaxId: null })).toBe("OFFICE");
    expect(await suggest({ vendorName: "Puig Fusters", vendorTaxId: "B11111111" })).toBe("OFFICE");
    expect(await suggest({ vendorName: "Repsol", vendorTaxId: null, aiCategory: ExpenseCategory.TRAVEL })).toBe("OTHER");
    expect(await suggest({ vendorName: "Nou Proveïdor SL", vendorTaxId: null, aiCategory: ExpenseCategory.MEALS })).toBe("MEALS");
    expect(await suggest({ vendorName: "Vueling Airlines", vendorTaxId: null })).toBe("TRAVEL");
    expect(await suggest({ vendorName: "Assessoria Pons", vendorTaxId: null })).toBeNull();

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });
});

describe("POST /organizations/:organizationId/expenses/auto-categorize", () => {
  it("fills missing categories it can infer and leaves the rest for the person", async () => {
    const organizationId = session.organizationId;
    const create = (vendorName: string, expenseCategory?: string) =>
      inject({
        method: "POST",
        url: `/organizations/${organizationId}/expenses`,
        payload: { vendorName, totalAmountCents: "1210", ...(expenseCategory ? { expenseCategory } : {}) },
      });
    // Manual expenses are categorized on creation too.
    const manual = await create("Uber BV");
    expect((manual.json() as { expenseCategory: string | null }).expenseCategory).toBe("TRAVEL");
    const unknown = await create("Assessoria Pons");
    expect((unknown.json() as { expenseCategory: string | null }).expenseCategory).toBeNull();

    // Older rows from before auto-categorization: clear them and let the endpoint fill them.
    await database.prisma.invoice.updateMany({ where: { organizationId }, data: { expenseCategory: null } });
    const response = await inject({ method: "POST", url: `/organizations/${organizationId}/expenses/auto-categorize` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ categorized: 1, remaining: 1 });
  });
});
