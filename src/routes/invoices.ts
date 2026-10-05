import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import { InvoiceStatus, MatchStatus, type PrismaClient } from "../../generated/prisma/client.js";
import type { S3Client } from "@aws-sdk/client-s3";
import type { UsageLimits } from "../config.js";
import { consumeQuota } from "../lib/quota.js";
import { deleteObject, getObject, putObject } from "../lib/storage.js";

const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);
const DEFAULT_LIMITS: UsageLimits = { aiDocumentsPerDay: 30, emailsPerDay: 20, organizationsPerUser: 3 };

export function registerInvoiceRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  storage: S3Client,
  bucket: string,
  queue: Queue,
  limits: UsageLimits = DEFAULT_LIMITS,
): void {
  /** Reads with the server's AI keys count against the user's daily limit; an organization's own keys don't. */
  const allowAiDocuments = async (userId: string | undefined, organizationId: string, amount: number) => {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { geminiApiKey: true, openaiApiKey: true, anthropicApiKey: true, deepseekApiKey: true, documentAiCredentialsJson: true },
    });
    const ownKeys = Boolean(org?.geminiApiKey || org?.openaiApiKey || org?.anthropicApiKey || org?.deepseekApiKey || org?.documentAiCredentialsJson);
    if (ownKeys || userId === undefined) return true;
    return consumeQuota(prisma, userId, "ai_document", limits.aiDocumentsPerDay, amount);
  };

  app.post("/organizations/:organizationId/invoices", async (request, reply) => {
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

    const uploads: Array<{ filename: string; mimeType: string; bytes: Buffer }> = [];
    for await (const file of request.files()) {
      const mimeType = file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;
      const bytes = await file.toBuffer();
      if (!ALLOWED.has(mimeType)) {
        return reply.code(400).send({ error: `Unsupported file type ${file.mimetype}` });
      }
      if (bytes.length === 0 || bytes.length > MAX_BYTES) {
        return reply.code(400).send({ error: "Each invoice file must be between 1 byte and 10 MB" });
      }
      uploads.push({ filename: file.filename || "invoice", mimeType, bytes });
    }
    if (uploads.length === 0) {
      return reply.code(400).send({ error: "At least one PDF, PNG, or JPEG invoice is required" });
    }
    if (!(await allowAiDocuments(request.userId, organizationId, uploads.length))) {
      return reply.code(429).send({ error: "Daily AI document limit reached" });
    }

    const invoiceIds: string[] = [];
    for (const upload of uploads) {
      const id = randomUUID();
      const storageKey = `invoices/${organizationId}/${id}/${safeName(upload.filename)}`;
      await putObject(storage, bucket, storageKey, upload.bytes, upload.mimeType);
      await prisma.invoice.create({
        data: {
          id,
          organizationId,
          storageKey,
          originalFilename: upload.filename.slice(0, 255),
          mimeType: upload.mimeType,
          fileSizeBytes: upload.bytes.length,
          status: InvoiceStatus.UPLOADED,
        },
      });
      await queue.add("extract", { invoiceId: id }, { jobId: id, removeOnComplete: 200 });
      await prisma.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.PROCESSING },
      });
      invoiceIds.push(id);
    }

    return reply.code(202).send({ invoiceIds });
  });

  app.post("/organizations/:organizationId/invoices/:invoiceId/reprocess", async (request, reply) => {
    const { organizationId, invoiceId } = request.params as { organizationId: string; invoiceId: string };
    if (!ORGANIZATION_ID.test(organizationId) || !ORGANIZATION_ID.test(invoiceId)) {
      return reply.code(400).send({ error: "organizationId and invoiceId must be UUIDs" });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });
    if (invoice === null) {
      return reply.code(404).send({ error: "Invoice not found" });
    }
    if (!(await allowAiDocuments(request.userId, organizationId, 1))) {
      return reply.code(429).send({ error: "Daily AI document limit reached" });
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.PROCESSING, errorMessage: null },
    });
    const jobId = `${invoiceId}-${Date.now()}`;
    await queue.add("extract", { invoiceId }, { jobId, removeOnComplete: 200 });

    return reply.code(202).send({ ok: true, invoiceId });
  });

  app.get("/organizations/:organizationId/invoices/:invoiceId/file", async (request, reply) => {
    const { organizationId, invoiceId } = request.params as { organizationId: string; invoiceId: string };
    if (!ORGANIZATION_ID.test(organizationId) || !ORGANIZATION_ID.test(invoiceId)) {
      return reply.code(400).send({ error: "organizationId and invoiceId must be UUIDs" });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { storageKey: true, mimeType: true, originalFilename: true },
    });
    if (invoice === null || !invoice.storageKey) {
      return reply.code(404).send({ error: "Invoice file not found" });
    }

    try {
      const buffer = await getObject(storage, bucket, invoice.storageKey);
      const filename = encodeURIComponent(invoice.originalFilename || "invoice");
      return reply
        .header("Content-Type", invoice.mimeType || "application/octet-stream")
        .header("Content-Disposition", `inline; filename="${filename}"; filename*=UTF-8''${filename}`)
        .header("Cache-Control", "private, max-age=3600")
        .send(buffer);
    } catch (error) {
      request.log.error({ err: error, invoiceId }, "failed to read invoice file from storage");
      return reply.code(500).send({ error: "Failed to read invoice file" });
    }
  });

  app.delete("/organizations/:organizationId/invoices/:invoiceId", async (request, reply) => {
    const { organizationId, invoiceId } = request.params as { organizationId: string; invoiceId: string };
    if (!ORGANIZATION_ID.test(organizationId) || !ORGANIZATION_ID.test(invoiceId)) {
      return reply.code(400).send({ error: "organizationId and invoiceId must be UUIDs" });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: {
        id: true,
        storageKey: true,
        reconciliation: { select: { transactionId: true } },
      },
    });
    if (invoice === null) {
      return reply.code(404).send({ error: "Invoice not found" });
    }

    if (invoice.reconciliation?.transactionId) {
      await prisma.bankTransaction.update({
        where: { id: invoice.reconciliation.transactionId },
        data: { matchStatus: MatchStatus.UNMATCHED },
      }).catch((err) => {
        request.log.warn({ err, invoiceId }, "could not reset bank transaction matchStatus on invoice delete");
      });
    }

    if (invoice.storageKey) {
      await deleteObject(storage, bucket, invoice.storageKey).catch((err) => {
        request.log.warn({ err, invoiceId }, "could not delete invoice object from storage");
      });
    }

    await prisma.invoice.delete({
      where: { id: invoice.id },
    });

    return reply.send({ ok: true, id: invoice.id });
  });
}

function safeName(filename: string): string {
  const cleaned = filename.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return cleaned.length === 0 ? "invoice" : cleaned;
}
