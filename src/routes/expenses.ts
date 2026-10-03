import type { FastifyInstance } from "fastify";
import { ExpenseCategory, InvoiceStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { reconcileOrganization } from "../matching/reconcile.js";
import { cents, day, findOrganization, parseDay, readUuid } from "./org-params.js";

const CATEGORIES = new Set<string>(Object.values(ExpenseCategory));

function parseCentsInput(val: unknown): bigint | null | undefined {
  if (val === undefined) return undefined;
  if (val === null || val === "") return null;
  if (typeof val === "bigint") return val;
  if (typeof val === "number" && Number.isInteger(val)) return BigInt(val);
  if (typeof val === "string" && /^-?\d+$/.test(val.trim())) return BigInt(val.trim());
  return undefined;
}

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
        vendorTaxId: row.vendorTaxId,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: day(row.invoiceDate),
        status: row.status,
        baseAmountCents: cents(row.baseAmountCents),
        totalAmountCents: cents(row.totalAmountCents),
        taxAmountCents: cents(row.taxAmountCents),
        expenseCategory: row.expenseCategory,
        originalFilename: row.originalFilename,
        mimeType: row.mimeType,
        hasFile: Boolean(row.storageKey),
      })),
    });
  });

  app.post("/organizations/:organizationId/expenses", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const body = (request.body as {
      vendorName?: unknown;
      vendorTaxId?: unknown;
      invoiceNumber?: unknown;
      invoiceDate?: unknown;
      baseAmountCents?: unknown;
      taxAmountCents?: unknown;
      totalAmountCents?: unknown;
      expenseCategory?: unknown;
    }) ?? {};

    const totalCents = parseCentsInput(body.totalAmountCents);
    if (totalCents === undefined || totalCents === null || totalCents <= 0n) {
      return reply.code(400).send({ error: "totalAmountCents must be a positive integer" });
    }

    const baseCents = parseCentsInput(body.baseAmountCents);
    const taxCents = parseCentsInput(body.taxAmountCents);

    let category: ExpenseCategory | null = null;
    if (typeof body.expenseCategory === "string" && CATEGORIES.has(body.expenseCategory)) {
      category = body.expenseCategory as ExpenseCategory;
    }

    const invoiceDate = body.invoiceDate ? parseDay(body.invoiceDate) : new Date();

    const created = await prisma.invoice.create({
      data: {
        organizationId,
        storageKey: "",
        originalFilename: "Despesa manual",
        mimeType: "",
        fileSizeBytes: 0,
        status: InvoiceStatus.PARSED,
        vendorName: typeof body.vendorName === "string" ? body.vendorName.trim().slice(0, 255) || null : null,
        vendorTaxId: typeof body.vendorTaxId === "string" ? body.vendorTaxId.trim().toUpperCase().slice(0, 50) || null : null,
        invoiceNumber: typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim().slice(0, 100) || null : null,
        invoiceDate,
        baseAmountCents: baseCents ?? null,
        taxAmountCents: taxCents ?? null,
        totalAmountCents: totalCents,
        expenseCategory: category,
      },
    });

    reconcileOrganization(prisma, organizationId).catch((err) => {
      request.log.warn({ err }, "could not reconcile after creating manual expense");
    });

    return reply.code(201).send({
      id: created.id,
      vendorName: created.vendorName,
      vendorTaxId: created.vendorTaxId,
      invoiceNumber: created.invoiceNumber,
      invoiceDate: day(created.invoiceDate),
      status: created.status,
      baseAmountCents: cents(created.baseAmountCents),
      totalAmountCents: cents(created.totalAmountCents),
      taxAmountCents: cents(created.taxAmountCents),
      expenseCategory: created.expenseCategory,
      originalFilename: created.originalFilename,
      mimeType: created.mimeType,
      hasFile: false,
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
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (invoice === null) {
      return reply.code(404).send({ error: "Invoice not found" });
    }

    const body = (request.body as {
      expenseCategory?: unknown;
      vendorName?: unknown;
      vendorTaxId?: unknown;
      invoiceNumber?: unknown;
      invoiceDate?: unknown;
      baseAmountCents?: unknown;
      taxAmountCents?: unknown;
      totalAmountCents?: unknown;
      status?: unknown;
    }) ?? {};

    const updateData: Prisma.InvoiceUpdateInput = {};

    // 1. Category
    if (body.expenseCategory !== undefined) {
      if (body.expenseCategory === null || body.expenseCategory === "") {
        updateData.expenseCategory = null;
      } else if (typeof body.expenseCategory === "string" && CATEGORIES.has(body.expenseCategory)) {
        updateData.expenseCategory = body.expenseCategory as ExpenseCategory;
      } else {
        return reply.code(400).send({ error: "expenseCategory must be OFFICE, TRAVEL, SOFTWARE, MEALS, or OTHER" });
      }
    }

    // 2. Vendor name
    if (body.vendorName !== undefined) {
      if (body.vendorName === null || body.vendorName === "") {
        updateData.vendorName = null;
      } else if (typeof body.vendorName === "string") {
        updateData.vendorName = body.vendorName.trim().slice(0, 255);
      }
    }

    // 3. Vendor tax ID (NIF/CIF)
    if (body.vendorTaxId !== undefined) {
      if (body.vendorTaxId === null || body.vendorTaxId === "") {
        updateData.vendorTaxId = null;
      } else if (typeof body.vendorTaxId === "string") {
        updateData.vendorTaxId = body.vendorTaxId.trim().toUpperCase().slice(0, 50);
      }
    }

    // 4. Invoice number
    if (body.invoiceNumber !== undefined) {
      if (body.invoiceNumber === null || body.invoiceNumber === "") {
        updateData.invoiceNumber = null;
      } else if (typeof body.invoiceNumber === "string") {
        updateData.invoiceNumber = body.invoiceNumber.trim().slice(0, 100);
      }
    }

    // 5. Invoice date
    if (body.invoiceDate !== undefined) {
      if (body.invoiceDate === null || body.invoiceDate === "") {
        updateData.invoiceDate = null;
      } else if (typeof body.invoiceDate === "string") {
        const parsed = parseDay(body.invoiceDate);
        if (!parsed) {
          return reply.code(400).send({ error: "invoiceDate must be formatted as YYYY-MM-DD" });
        }
        updateData.invoiceDate = parsed;
      }
    }

    // 6. Base amount cents
    if (body.baseAmountCents !== undefined) {
      const parsed = parseCentsInput(body.baseAmountCents);
      if (parsed === undefined) {
        return reply.code(400).send({ error: "baseAmountCents must be integer cents" });
      }
      updateData.baseAmountCents = parsed;
    }

    // 7. Tax amount cents
    if (body.taxAmountCents !== undefined) {
      const parsed = parseCentsInput(body.taxAmountCents);
      if (parsed === undefined) {
        return reply.code(400).send({ error: "taxAmountCents must be integer cents" });
      }
      updateData.taxAmountCents = parsed;
    }

    // 8. Total amount cents
    if (body.totalAmountCents !== undefined) {
      const parsed = parseCentsInput(body.totalAmountCents);
      if (parsed === undefined) {
        return reply.code(400).send({ error: "totalAmountCents must be integer cents" });
      }
      updateData.totalAmountCents = parsed;
    }

    // If an invoice is currently FAILED and totalAmountCents is provided/present and positive, transition to PARSED
    const newTotal = updateData.totalAmountCents;
    const finalTotal = typeof newTotal === "bigint" ? newTotal : typeof newTotal === "number" ? BigInt(newTotal) : invoice.totalAmountCents;
    if (invoice.status === InvoiceStatus.FAILED && finalTotal !== null && finalTotal > 0n) {
      updateData.status = InvoiceStatus.PARSED;
      updateData.errorMessage = null;
    } else if (body.status === "PARSED") {
      updateData.status = InvoiceStatus.PARSED;
      updateData.errorMessage = null;
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: updateData,
    });

    if (updated.status === InvoiceStatus.PARSED && (updateData.totalAmountCents !== undefined || updateData.vendorName !== undefined)) {
      reconcileOrganization(prisma, organizationId).catch((err) => {
        request.log.warn({ err }, "could not reconcile after updating expense");
      });
    }

    return reply.send({
      id: updated.id,
      vendorName: updated.vendorName,
      vendorTaxId: updated.vendorTaxId,
      invoiceNumber: updated.invoiceNumber,
      invoiceDate: day(updated.invoiceDate),
      status: updated.status,
      baseAmountCents: cents(updated.baseAmountCents),
      totalAmountCents: cents(updated.totalAmountCents),
      taxAmountCents: cents(updated.taxAmountCents),
      expenseCategory: updated.expenseCategory,
      originalFilename: updated.originalFilename,
      mimeType: updated.mimeType,
      hasFile: Boolean(updated.storageKey),
    });
  });
}
