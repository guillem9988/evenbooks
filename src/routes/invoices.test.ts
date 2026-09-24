import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { createDatabase } from "../lib/prisma.js";
import { buildServer } from "../server.js";
import { openSession, withSession } from "../test/session.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildServer(config);
const session = await openSession(app, "invoices");
const inject = withSession(app, session.cookie);

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("POST /organizations/:organizationId/invoices", () => {
  it("returns 400 for a bad id or file type, 404 for a missing organization, and 202 for a PDF", async () => {
    const bad = await inject({ method: "POST", url: "/organizations/nope/invoices" });
    expect(bad.statusCode).toBe(400);

    const missing = await inject({
      method: "POST",
      url: "/organizations/00000000-0000-4000-8000-000000000009/invoices",
      ...filePayload("note.txt", "text/plain", "hello"),
    });
    expect(missing.statusCode).toBe(404);

    const organization = await database.prisma.organization.create({
      data: { legalName: "Upload Test SL", taxId: "B00000004", memberships: { create: { userId: session.userId } } },
    });
    const rejected = await inject({
      method: "POST",
      url: `/organizations/${organization.id}/invoices`,
      ...filePayload("note.txt", "text/plain", "hello"),
    });
    expect(rejected.statusCode).toBe(400);

    const accepted = await inject({
      method: "POST",
      url: `/organizations/${organization.id}/invoices`,
      ...filePayload("scan.png", "image/png", pngBytes()),
    });
    expect(accepted.statusCode).toBe(202);
    const body = accepted.json() as { invoiceIds: string[] };
    expect(body.invoiceIds).toHaveLength(1);

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });
});

function filePayload(filename: string, mime: string, contents: string | Buffer): { headers: Record<string, string>; payload: Buffer } {
  const boundary = "----matchinvoice";
  const body = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  };
}

function pngBytes(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}
