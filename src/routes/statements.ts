import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { CsvStatementError, parseBankCsv } from "../statements/parse-csv.js";

const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerStatementRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.post("/organizations/:organizationId/statements", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    if (!ORGANIZATION_ID.test(organizationId)) {
      return reply.code(400).send({ error: "organizationId must be a UUID" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (organization === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const file = await request.file();
    if (file === undefined) {
      return reply.code(400).send({ error: "CSV file is required" });
    }

    const sourceBank = readSourceBank(file.fields.source_bank);
    if (sourceBank instanceof Error) {
      return reply.code(400).send({ error: sourceBank.message });
    }

    let transactions;
    try {
      transactions = parseBankCsv((await file.toBuffer()).toString("utf8"));
    } catch (error) {
      const message = error instanceof CsvStatementError ? error.message : "Invalid CSV file";
      return reply.code(400).send({ error: message });
    }

    const statement = await prisma.bankStatement.create({
      data: {
        organizationId,
        filename: file.filename || "statement.csv",
        sourceBank,
        totalTransactions: transactions.length,
        transactions: {
          create: transactions.map((transaction) => ({
            organizationId,
            transactionDate: transaction.transactionDate,
            valueDate: transaction.valueDate,
            amountCents: transaction.amountCents,
            rawDescription: transaction.rawDescription,
          })),
        },
      },
      select: { id: true, totalTransactions: true },
    });

    return reply.code(201).send({
      statementId: statement.id,
      totalTransactions: statement.totalTransactions,
    });
  });
}

function readSourceBank(field: unknown): string | null | Error {
  if (field === undefined) {
    return null;
  }
  const candidate = field as { type?: string; value?: unknown };
  if (candidate.type !== "field" || typeof candidate.value !== "string") {
    return new Error("source_bank must be a text field");
  }
  const value = candidate.value.trim();
  if (value.length === 0) {
    return null;
  }
  if (value.length > 100) {
    return new Error("source_bank must be at most 100 characters");
  }
  return value;
}
