import { pathToFileURL } from "node:url";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { loadConfig, type AppConfig } from "./config.js";
import { createInvoiceProcessingQueue, INVOICE_PROCESSING_QUEUE } from "./lib/queue.js";
import { checkPostgres, createDatabase } from "./lib/prisma.js";
import { RedisClient } from "./lib/redis.js";
import { checkStorage, createStorageClient, getObject } from "./lib/storage.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerInvoiceRoutes } from "./routes/invoices.js";
import { registerReconcileRoutes } from "./routes/reconcile.js";
import { registerStatementRoutes } from "./routes/statements.js";
import { startInvoiceWorker } from "./workers/invoice-worker.js";

export async function buildServer(config: AppConfig) {
  const app = Fastify({ logger: true });
  const database = createDatabase(config.databaseUrl, (error) => {
    app.log.warn({ err: error }, "postgres pool error");
  });
  const redis = new RedisClient(config.redisUrl, (error) => {
    app.log.warn({ err: error }, "redis client error");
  });
  const storage = createStorageClient(config.s3);
  const invoiceQueue = createInvoiceProcessingQueue(config.redisUrl);
  const invoiceWorker = startInvoiceWorker(
    database.prisma,
    { get: (key) => getObject(storage, config.s3.bucket, key) },
    config.redisUrl,
    config.openaiApiKey,
  );
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 20 } });

  registerHealthRoutes(app, {
    checkPostgres: () => checkPostgres(database.prisma),
    checkRedis: () => redis.ping(),
    checkMinio: () => checkStorage(storage, config.s3.bucket),
  });
  registerReconcileRoutes(app, database.prisma);
  registerStatementRoutes(app, database.prisma);
  registerInvoiceRoutes(app, database.prisma, storage, config.s3.bucket, invoiceQueue);

  app.addHook("onClose", async () => {
    await invoiceWorker.close();
    await invoiceQueue.close();
    await database.close();
    await redis.close();
    storage.destroy();
  });

  app.log.info({ queue: INVOICE_PROCESSING_QUEUE }, "invoice processing worker started");

  return app;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildServer(config);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    await app.close();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT").then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, "shutdown failed");
        process.exit(1);
      },
    );
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, "shutdown failed");
        process.exit(1);
      },
    );
  });

  await app.listen({ port: config.port, host: config.host });
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
