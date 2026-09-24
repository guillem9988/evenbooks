import type { FastifyInstance } from "fastify";

export interface DependencyCheck {
  status: "up" | "down";
  error?: string;
}

export interface HealthReport {
  status: "ok" | "error";
  postgres: DependencyCheck;
  redis: DependencyCheck;
  minio: DependencyCheck;
}

export interface HealthChecks {
  checkPostgres: () => Promise<void>;
  checkRedis: () => Promise<void>;
  checkMinio: () => Promise<void>;
}

const HEALTH_TIMEOUT_MS = 3_000;

export function registerHealthRoutes(app: FastifyInstance, checks: HealthChecks): void {
  app.get("/health", async (_request, reply) => {
    const [postgres, redis, minio] = await Promise.all([
      runCheck(checks.checkPostgres),
      runCheck(checks.checkRedis),
      runCheck(checks.checkMinio),
    ]);

    const body: HealthReport = {
      status: postgres.status === "up" ? "ok" : "error",
      postgres,
      redis,
      minio,
    };

    return reply.code(body.status === "ok" ? 200 : 503).send(body);
  });
}

async function runCheck(check: () => Promise<void>): Promise<DependencyCheck> {
  try {
    await withTimeout(check(), HEALTH_TIMEOUT_MS);
    return { status: "up" };
  } catch (error) {
    return { status: "down", error: publicError(error) };
  }
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("timed out"));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

function publicError(error: unknown): string {
  const message = describeError(error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return message === "" ? "check failed" : message;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "check failed";
  }

  const nested = nestedErrors(error)
    .map((item) => describeError(item))
    .filter((item) => item !== "" && item !== "check failed");
  if (nested.length > 0) {
    return nested.join("; ");
  }

  const code = readCode(error);
  const message = error.message.replace(/\s+/g, " ").trim();
  const boilerplate = message.startsWith("Invalid `") && message.includes("invocation:");
  if (boilerplate || message === "") {
    return code ?? "check failed";
  }
  if (code !== undefined && !message.includes(code)) {
    return `${code}: ${message}`;
  }
  return message;
}

function nestedErrors(error: Error): unknown[] {
  if (error instanceof AggregateError) {
    return [...error.errors];
  }
  const maybe = (error as { errors?: unknown }).errors;
  return Array.isArray(maybe) ? maybe : [];
}

function readCode(error: Error): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() !== "" ? code : undefined;
}
