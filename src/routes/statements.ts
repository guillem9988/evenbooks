import type { FastifyInstance } from "fastify";
import { IssuedInvoiceStatus, type PrismaClient } from "../../generated/prisma/client.js";
import { StatementFileError } from "../statements/parse-csv.js";
import { parseStatementFile, statementExtension } from "../statements/parse-statement.js";
import { isEmailVerified } from "../auth/verification.js";
import { consumeQuota } from "../lib/quota.js";

const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerStatementRoutes(app: FastifyInstance, prisma: PrismaClient, aiDocumentsPerDay = 30): void {
  app.post("/organizations/:organizationId/statements", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    if (!ORGANIZATION_ID.test(organizationId)) {
      return reply.code(400).send({ error: "organizationId must be a UUID" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        geminiApiKey: true,
        openaiApiKey: true,
        extractorModel: true,
      },
    });
    if (organization === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const file = await request.file();
    if (file === undefined) {
      return reply.code(400).send({ error: "Statement file is required" });
    }
    if (statementExtension(file.filename) === null) {
      return reply.code(400).send({ error: "Unsupported statement file" });
    }

    const sourceBank = readSourceBank(file.fields.source_bank);
    if (sourceBank instanceof Error) {
      return reply.code(400).send({ error: sourceBank.message });
    }

    // PDF statements are read by the AI with the server's key unless the organization has its own:
    // same verification and daily limit as uploaded invoices.
    if (statementExtension(file.filename) === "pdf" && !organization.geminiApiKey && request.userId !== undefined) {
      if (!(await isEmailVerified(prisma, request.userId))) {
        return reply.code(403).send({ error: "Email not verified" });
      }
      if (!(await consumeQuota(prisma, request.userId, "ai_document", aiDocumentsPerDay))) {
        return reply.code(429).send({ error: "Daily AI document limit reached" });
      }
    }

    let transactions;
    try {
      transactions = await parseStatementFile(file.filename, await file.toBuffer(), {
        apiKey: organization.geminiApiKey || process.env.GEMINI_API_KEY || null,
        model: organization.extractorModel,
      });
    } catch (error) {
      const message = error instanceof StatementFileError ? error.message : "Unreadable statement file";
      return reply.code(400).send({ error: message });
    }
    if (transactions.length === 0) {
      return reply.code(400).send({ error: "Statement has no transactions" });
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

  app.get("/organizations/:organizationId/statements", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    if (!ORGANIZATION_ID.test(organizationId)) {
      return reply.code(400).send({ error: "organizationId must be a UUID" });
    }

    const statements = await prisma.bankStatement.findMany({
      where: { organizationId },
      orderBy: { importedAt: "desc" },
      select: {
        id: true,
        filename: true,
        sourceBank: true,
        importedAt: true,
        totalTransactions: true,
      },
    });

    return reply.send({ statements });
  });

  app.delete("/organizations/:organizationId/statements/:statementId", async (request, reply) => {
    const { organizationId, statementId } = request.params as { organizationId: string; statementId: string };
    if (!ORGANIZATION_ID.test(organizationId) || !ORGANIZATION_ID.test(statementId)) {
      return reply.code(400).send({ error: "organizationId and statementId must be UUIDs" });
    }

    const statement = await prisma.bankStatement.findFirst({
      where: { id: statementId, organizationId },
      select: { id: true },
    });
    if (statement === null) {
      return reply.code(404).send({ error: "Statement not found" });
    }

    // Reset any matched client issued invoices to UNPAID before cascade delete
    const matchedIssued = await prisma.reconciliationMatch.findMany({
      where: {
        transaction: { statementId },
        issuedInvoiceId: { not: null },
      },
      select: { issuedInvoiceId: true },
    });

    const issuedIds = matchedIssued
      .map((m) => m.issuedInvoiceId)
      .filter((id): id is string => typeof id === "string");

    if (issuedIds.length > 0) {
      await prisma.issuedInvoice.updateMany({
        where: { id: { in: issuedIds } },
        data: { status: IssuedInvoiceStatus.UNPAID },
      });
    }

    await prisma.bankStatement.delete({
      where: { id: statementId },
    });

    return reply.send({ ok: true, id: statementId });
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
