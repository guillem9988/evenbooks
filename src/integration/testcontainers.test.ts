import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import multipart from "@fastify/multipart";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import { createDatabase, type Database } from "../lib/prisma.js";
import { registerStatementRoutes } from "../routes/statements.js";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));

describe("Testcontainers Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let database: Database;

  beforeAll(async () => {
    await assertDocker();
    container = await new PostgreSqlContainer("postgres:16").withStartupTimeout(90_000).start();
    await deployMigrations(container.getConnectionUri());
    database = createDatabase(container.getConnectionUri());
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    await container?.stop();
  }, 30_000);

  it("leaves the five tables and the trigram indexes", async () => {
    const tables = await database.prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    expect(tables.map((row) => row.table_name).filter((name) => name !== "_prisma_migrations")).toEqual([
      "bank_statements",
      "bank_transactions",
      "invoices",
      "organizations",
      "reconciliation_matches",
    ]);

    const extensions = await database.prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'pgcrypto') ORDER BY extname
    `;
    expect(extensions.map((row) => row.extname)).toEqual(["pg_trgm", "pgcrypto"]);

    const indexes = await database.prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE indexname IN ('idx_transactions_desc_trgm', 'idx_invoices_vendor_trgm')
      ORDER BY indexname
    `;
    expect(indexes.map((row) => row.indexname)).toEqual(["idx_invoices_vendor_trgm", "idx_transactions_desc_trgm"]);
    expect(indexes.every((row) => row.indexdef.includes("gin_trgm_ops"))).toBe(true);
  });

  it("persists a statement import as signed amount_cents", async () => {
    const organization = await database.prisma.organization.create({
      data: { legalName: "Container Import SL", taxId: "B10000001" },
    });
    const app = Fastify();
    await app.register(multipart);
    registerStatementRoutes(app, database.prisma);

    const response = await app.inject({
      method: "POST",
      url: `/organizations/${organization.id}/statements`,
      ...csvPayload("Fecha;Concepto;Importe\n12/03/2026;Acme;-121,00\n"),
    });
    expect(response.statusCode).toBe(201);

    const stored = await database.prisma.bankTransaction.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    expect(stored.amountCents).toBe(-12100n);
    expect(typeof stored.amountCents).toBe("bigint");
    await app.close();
  });

  it("rejects a second parallel match on the same transaction", async () => {
    const organization = await database.prisma.organization.create({
      data: { legalName: "Container Match SL", taxId: "B10000002" },
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
            status: "PARSED",
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
  });
});

async function assertDocker(): Promise<void> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 8_000 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "docker info failed";
    throw new Error(
      `Docker is required for Testcontainers integration tests and is not available. ${detail}`,
    );
  }
}

async function deployMigrations(databaseUrl: string): Promise<void> {
  await execFileAsync("node_modules/.bin/prisma", ["migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout: 60_000,
  });
}

function csvPayload(csv: string): { headers: Record<string, string>; payload: string } {
  const boundary = "----matchinvoice";
  const payload = [
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
