import { Queue } from "bullmq";

/** Reserved for the OCR worker. Step 1 does not start a worker or connect. */
export const INVOICE_OCR_QUEUE = "invoice-ocr";

export const INVOICE_PROCESSING_QUEUE = "invoice-processing-queue";

export interface BullmqConnection {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: { servername: string };
  maxRetriesPerRequest: null;
}

/** `rediss://` (Upstash and other hosted Redis) turns on TLS; `redis://` stays plain for local Compose. */
export function bullmqConnection(redisUrl: string): BullmqConnection {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must start with redis:// or rediss://");
  }
  const port = url.port === "" ? 6379 : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("REDIS_URL port is invalid");
  }
  const db = url.pathname.replace(/^\//, "");

  return {
    host: url.hostname,
    port,
    maxRetriesPerRequest: null,
    ...(url.username === "" ? {} : { username: decodeURIComponent(url.username) }),
    ...(url.password === "" ? {} : { password: decodeURIComponent(url.password) }),
    ...(db === "" ? {} : { db: Number(db) }),
    ...(url.protocol === "rediss:" ? { tls: { servername: url.hostname } } : {}),
  };
}

export function createInvoiceOcrQueue(redisUrl: string): Queue {
  return new Queue(INVOICE_OCR_QUEUE, {
    connection: bullmqConnection(redisUrl),
  });
}

export function createInvoiceProcessingQueue(redisUrl: string): Queue {
  return new Queue(INVOICE_PROCESSING_QUEUE, {
    connection: bullmqConnection(redisUrl),
  });
}
