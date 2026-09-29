import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import { InvoiceStatus, type PrismaClient } from "../../generated/prisma/client.js";
import type { S3Client } from "@aws-sdk/client-s3";
import { putObject } from "../lib/storage.js";

const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

export function registerInvoiceRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  storage: S3Client,
  bucket: string,
  queue: Queue,
): void {
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

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.PROCESSING, errorMessage: null },
    });
    const jobId = `${invoiceId}-${Date.now()}`;
    await queue.add("extract", { invoiceId }, { jobId, removeOnComplete: 200 });

    return reply.code(202).send({ ok: true, invoiceId });
  });
}

function safeName(filename: string): string {
  const cleaned = filename.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return cleaned.length === 0 ? "invoice" : cleaned;
}
