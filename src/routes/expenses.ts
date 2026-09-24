import type { FastifyInstance } from "fastify";
import { ExpenseCategory, InvoiceStatus, type PrismaClient } from "../../generated/prisma/client.js";
import { cents, day, findOrganization, readUuid } from "./org-params.js";

const CATEGORIES = new Set<string>(Object.values(ExpenseCategory));

export function registerExpenseRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/organizations/:organizationId/expenses", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const rows = await prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({
      expenses: rows.map((row) => ({
        id: row.id,
        vendorName: row.vendorName,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: day(row.invoiceDate),
        status: row.status,
        totalAmountCents: cents(row.totalAmountCents),
        taxAmountCents: cents(row.taxAmountCents),
        expenseCategory: row.expenseCategory,
      })),
    });
  });

  app.patch("/organizations/:organizationId/invoices/:invoiceId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const invoiceId = readUuid((request.params as { invoiceId?: string }).invoiceId, "invoiceId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (invoiceId instanceof Error) {
      return reply.code(400).send({ error: invoiceId.message });
    }
    const category = (request.body as { expenseCategory?: unknown })?.expenseCategory;
    if (typeof category !== "string" || !CATEGORIES.has(category)) {
      return reply.code(400).send({ error: "expenseCategory must be OFFICE, TRAVEL, SOFTWARE, MEALS, or OTHER" });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (invoice === null) {
      return reply.code(404).send({ error: "Invoice not found" });
    }
    if (invoice.status !== InvoiceStatus.PARSED) {
      return reply.code(400).send({ error: "Only a parsed invoice can take an expense category" });
    }
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { expenseCategory: category as ExpenseCategory },
    });
    return reply.send({ id: updated.id, expenseCategory: updated.expenseCategory });
  });
}
