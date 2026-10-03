import { afterAll, describe, expect, it } from "vitest";
import { ContactRole } from "../../generated/prisma/client.js";
import { loadConfig } from "../config.js";
import { createDatabase } from "../lib/prisma.js";
import { buildServer } from "../server.js";
import { openSession, withSession } from "../test/session.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildServer(config);
const session = await openSession(app, "contacts");
const inject = withSession(app, session.cookie);

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("Contact routes", () => {
  it("creates, reads, updates and safely deletes contacts", { timeout: 25000 }, async () => {
    const organization = await database.prisma.organization.create({
      data: {
        legalName: "Contacts Test Org SL",
        taxId: "B99990001",
        memberships: { create: { userId: session.userId } },
      },
    });

    // 1. Validation on create
    const badRole = await inject({
      method: "POST",
      url: `/organizations/${organization.id}/contacts`,
      payload: { legalName: "Acme", taxId: "B12345678", email: "test@example.com", role: "INVALID" },
    });
    expect(badRole.statusCode).toBe(400);

    // 2. Successful create
    const createRes = await inject({
      method: "POST",
      url: `/organizations/${organization.id}/contacts`,
      payload: {
        legalName: "Client Alpha SL",
        taxId: "B12345678",
        email: "alpha@example.com",
        role: "CLIENT",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { id: string; legalName: string; role: string; taxId: string; email: string };
    expect(created.legalName).toBe("Client Alpha SL");
    expect(created.role).toBe(ContactRole.CLIENT);

    // 3. List contacts
    const listRes = await inject({
      method: "GET",
      url: `/organizations/${organization.id}/contacts`,
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json() as { contacts: Array<{ id: string; legalName: string }> };
    expect(listBody.contacts.some((c) => c.id === created.id)).toBe(true);

    // 4. Update contact (PATCH)
    const patchRes = await inject({
      method: "PATCH",
      url: `/organizations/${organization.id}/contacts/${created.id}`,
      payload: {
        legalName: "Client Alpha Updated SL",
        email: "newemail@example.com",
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json() as { legalName: string; email: string };
    expect(patched.legalName).toBe("Client Alpha Updated SL");
    expect(patched.email).toBe("newemail@example.com");

    // 5. Deletion guard: create an issued invoice for this contact
    await database.prisma.issuedInvoice.create({
      data: {
        organizationId: organization.id,
        contactId: created.id,
        seriesNumber: "F-TEST-001",
        invoiceDate: new Date("2026-03-01"),
        status: "UNPAID",
        baseAmountCents: 10000n,
        taxAmountCents: 2100n,
        totalAmountCents: 12100n,
        lines: {
          create: {
            description: "Consultoria",
            quantity: 1,
            unitAmountCents: 10000n,
            taxRate: "GENERAL_21",
            baseAmountCents: 10000n,
            taxAmountCents: 2100n,
            totalAmountCents: 12100n,
          },
        },
      },
    });

    const guardRes = await inject({
      method: "DELETE",
      url: `/organizations/${organization.id}/contacts/${created.id}`,
    });
    expect(guardRes.statusCode).toBe(409);

    // 6. Create another contact without relations and delete it
    const supplierRes = await inject({
      method: "POST",
      url: `/organizations/${organization.id}/contacts`,
      payload: {
        legalName: "Supplier Beta SL",
        taxId: "A98765432",
        email: "beta@example.com",
        role: "SUPPLIER",
      },
    });
    expect(supplierRes.statusCode).toBe(201);
    const supplier = supplierRes.json() as { id: string };

    const deleteRes = await inject({
      method: "DELETE",
      url: `/organizations/${organization.id}/contacts/${supplier.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);

    const checkDeleted = await database.prisma.contact.findUnique({
      where: { id: supplier.id },
    });
    expect(checkDeleted).toBeNull();
  });
});
