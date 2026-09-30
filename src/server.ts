import { pathToFileURL } from "node:url";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { loadConfig, type AppConfig } from "./config.js";
import { createInvoiceProcessingQueue, INVOICE_PROCESSING_QUEUE } from "./lib/queue.js";
import { checkPostgres, createDatabase } from "./lib/prisma.js";
import { RedisClient } from "./lib/redis.js";
import { checkStorage, createStorageClient, getObject } from "./lib/storage.js";
import { registerOrganizationGuard } from "./auth/guard.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerContactRoutes } from "./routes/contacts.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerExpenseRoutes } from "./routes/expenses.js";
import { registerIssuedInvoiceRoutes } from "./routes/issued-invoices.js";
import { registerQuoteRoutes } from "./routes/quotes.js";
import { registerRecurringRoutes } from "./routes/recurring.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerInvoiceRoutes } from "./routes/invoices.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerReconcileRoutes } from "./routes/reconcile.js";
import { registerReconciliationRoutes } from "./routes/reconciliation.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerStatementRoutes } from "./routes/statements.js";
import { startInvoiceWorker } from "./workers/invoice-worker.js";

export async function buildServer(config: AppConfig) {
  const app = Fastify({ logger: true, trustProxy: config.trustProxy });
  const database = createDatabase(
    config.databaseUrl,
    (error) => {
      app.log.warn({ err: error }, "postgres pool error");
    },
    config.database,
  );
  const redis = new RedisClient(config.redisUrl, (error) => {
    app.log.warn({ err: error }, "redis client error");
  });
  const storage = createStorageClient(config.s3);
  const invoiceQueue = createInvoiceProcessingQueue(config.redisUrl);
  const invoiceWorker = startInvoiceWorker(
    database.prisma,
    { get: (key) => getObject(storage, config.s3.bucket, key) },
    config.redisUrl,
    config.extractor,
    config.worker,
  );
  await app.register(cors, {
    origin: config.webOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 20 } });

  registerAuthRoutes(app, database.prisma, config.cookie, config.registration, config.googleOAuth, config.webOrigins);
  registerOrganizationGuard(app, database.prisma);
  registerHealthRoutes(app, {
    checkPostgres: () => checkPostgres(database.prisma),
    checkRedis: () => redis.ping(),
    checkMinio: () => checkStorage(storage, config.s3.bucket),
  });
  registerOrganizationRoutes(app, database.prisma);
  registerContactRoutes(app, database.prisma);
  registerCatalogRoutes(app, database.prisma);
  registerIssuedInvoiceRoutes(app, database.prisma);
  registerQuoteRoutes(app, database.prisma);
  registerRecurringRoutes(app, database.prisma);
  registerExpenseRoutes(app, database.prisma);
  registerDashboardRoutes(app, database.prisma);
  registerReconcileRoutes(app, database.prisma);
  registerReconciliationRoutes(app, database.prisma);
  registerStatementRoutes(app, database.prisma);
  registerInvoiceRoutes(app, database.prisma, storage, config.s3.bucket, invoiceQueue);
  registerSettingsRoutes(app, database.prisma, config.extractor);
  registerReportRoutes(app, database.prisma, {
    get: (key) => getObject(storage, config.s3.bucket, key),
  });

  app.addHook("onClose", async () => {
    await invoiceWorker.close();
    await invoiceQueue.close();
    await database.close();
    await redis.close();
    storage.destroy();
  });

  app.log.info(
    { queue: INVOICE_PROCESSING_QUEUE, webOrigins: config.webOrigins, databaseSsl: config.database.ssl, cookieSameSite: config.cookie.sameSite },
    "invoice processing worker started in the API process",
  );

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
