import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { buildServer } from "../server.js";
import { openSession, withSession } from "../test/session.js";

// Tight limits so each one trips quickly; the rest of the configuration is the normal test setup.
const app = await buildServer(
  loadConfig({ ...process.env, DAILY_AI_DOCUMENTS_PER_USER: "0", DAILY_EMAILS_PER_USER: "1", MAX_ORGANIZATIONS_PER_USER: "2" }),
);
const session = await openSession(app, "limits");
const inject = withSession(app, session.cookie);

afterAll(async () => {
  await app.close();
});

describe("per-user usage limits", () => {
  it("caps how many organizations one user can own", async () => {
    const second = await inject({ method: "POST", url: "/organizations", payload: { legalName: "Segona SL", taxId: "B70000002" } });
    expect(second.statusCode).toBe(201);
    const third = await inject({ method: "POST", url: "/organizations", payload: { legalName: "Tercera SL", taxId: "B70000003" } });
    expect(third.statusCode).toBe(403);
    expect(third.json()).toEqual({ error: "Organization limit reached" });
  });

  it("refuses AI uploads over the daily limit before storing anything", async () => {
    const boundary = "----limits";
    const body = [`--${boundary}`, 'Content-Disposition: form-data; name="files"; filename="f.pdf"', "Content-Type: application/pdf", "", "%PDF-1.4 test", `--${boundary}--`, ""].join("\r\n");
    const response = await inject({
      method: "POST",
      url: `/organizations/${session.organizationId}/invoices`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "Daily AI document limit reached" });
  });

  it("allows the daily number of emails and refuses the next one", async () => {
    const organizationId = session.organizationId;
    const contact = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/contacts`,
      payload: { legalName: "Client Límits", taxId: "B70000009", email: "client@example.com", role: "CLIENT" },
    });
    const invoice = await inject({
      method: "POST",
      url: `/organizations/${organizationId}/issued-invoices`,
      payload: {
        contactId: (contact.json() as { id: string }).id,
        invoiceDate: "2026-10-01",
        seriesNumber: "L-1",
        lines: [{ description: "Servei", quantity: 1, unitAmountCents: "10000", taxRate: 21 }],
      },
    });
    const url = `/organizations/${organizationId}/issued-invoices/${(invoice.json() as { id: string }).id}/send-email`;
    expect((await inject({ method: "POST", url, payload: {} })).statusCode).toBe(200);
    const second = await inject({ method: "POST", url, payload: {} });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: "Daily email limit reached" });
  });
});
