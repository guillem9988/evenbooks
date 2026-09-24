import { afterAll, describe, expect, it } from "vitest";
import { MatchStatus } from "../../generated/prisma/client.js";
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

describe("POST /organizations/:organizationId/statements", () => {
  it("returns 400 for a bad id, 404 for a missing organization, and imports a CSV", async () => {
    const bad = await app.inject({ method: "POST", url: "/organizations/nope/statements" });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: "/organizations/00000000-0000-4000-8000-000000000001/statements",
      ...csvPayload("Fecha,Concepto,Importe\n12/03/2026,Acme,-121.00\n", "Caixa"),
    });
    expect(missing.statusCode).toBe(404);

    const organization = await database.prisma.organization.create({
      data: { legalName: "Statement Test SL", taxId: "B00000002" },
    });
    const response = await app.inject({
      method: "POST",
      url: `/organizations/${organization.id}/statements`,
      ...csvPayload('Fecha;Concepto;Importe\n12/03/2026;  Acme   SL  ;-121,00\n', "Caixa"),
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { statementId: string; totalTransactions: number };
    expect(body.totalTransactions).toBe(1);

    const statement = await database.prisma.bankStatement.findUniqueOrThrow({
      where: { id: body.statementId },
      include: { transactions: true },
    });
    expect(statement.sourceBank).toBe("Caixa");
    expect(statement.totalTransactions).toBe(1);
    expect(statement.transactions[0]?.amountCents).toBe(-12100n);
    expect(statement.transactions[0]?.rawDescription).toBe("Acme SL");
    expect(statement.transactions[0]?.matchStatus).toBe(MatchStatus.UNMATCHED);

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });
});

function csvPayload(csv: string, sourceBank: string): { headers: Record<string, string>; payload: string } {
  const boundary = "----matchinvoice";
  const payload = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="source_bank"',
    "",
    sourceBank,
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="movements.csv"',
    "Content-Type: text/csv",
    "",
    csv,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  };
}
