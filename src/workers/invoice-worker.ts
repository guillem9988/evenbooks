import { Worker } from "bullmq";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ExtractorConfig, WorkerConfig } from "../config.js";
import { bullmqConnection, INVOICE_PROCESSING_QUEUE } from "../lib/queue.js";
import type { InvoiceObjectStore } from "../invoices/process.js";
import { processInvoiceJob } from "../invoices/process.js";

export function startInvoiceWorker(
  prisma: PrismaClient,
  store: InvoiceObjectStore,
  redisUrl: string,
  extractor: ExtractorConfig,
  options: WorkerConfig = { drainDelaySeconds: 5, stalledIntervalMs: 30_000 },
): Worker {
  const worker = new Worker(
    INVOICE_PROCESSING_QUEUE,
    async (job) => {
      const invoiceId = (job.data as { invoiceId?: string }).invoiceId;
      if (invoiceId === undefined || invoiceId === "") {
        return;
      }
      await processInvoiceJob(prisma, store, invoiceId, extractor);
    },
    {
      connection: bullmqConnection(redisUrl),
      drainDelay: options.drainDelaySeconds,
      stalledInterval: options.stalledIntervalMs,
    },
  );
  worker.on("error", () => undefined);
  return worker;
}
