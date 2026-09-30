import "dotenv/config";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

export type DatabaseSslMode = "disable" | "no-verify" | "verify";

export interface DatabaseConfig {
  ssl: DatabaseSslMode;
  caCert: string | null;
  poolMax: number;
}

export type SameSite = "lax" | "strict" | "none";

export interface CookieConfig {
  secure: boolean;
  sameSite: SameSite;
  domain: string | null;
}

export interface WorkerConfig {
  drainDelaySeconds: number;
  stalledIntervalMs: number;
}

export type InvoiceExtractorMode = "auto" | "documentai" | "openai" | "anthropic" | "deepseek" | "local";

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

export interface DocumentAiConfig {
  projectId: string;
  location: string;
  processorId: string;
  credentials: ServiceAccountCredentials;
}

export interface ExtractorConfig {
  mode: InvoiceExtractorMode;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  deepseekApiKey: string | null;
  documentAi: DocumentAiConfig | null;
}

export interface RegistrationConfig {
  allowPublic: boolean;
  inviteCode: string | null;
}

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  database: DatabaseConfig;
  redisUrl: string;
  s3: S3Config;
  openaiApiKey: string | null;
  extractor: ExtractorConfig;
  webOrigins: string[];
  cookie: CookieConfig;
  registration: RegistrationConfig;
  trustProxy: boolean;
  worker: WorkerConfig;
}

const DEFAULT_DATABASE_URL =
  "postgresql://matchinvoice:matchinvoice@localhost:54329/matchinvoice";
const DEFAULT_REDIS_URL = "redis://localhost:63799";
const LOCAL_WEB_ORIGINS = ["http://127.0.0.1:43124", "http://localhost:43124"];

type Env = Record<string, string | undefined>;

function readString(env: Env, name: string, fallback: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

function readInteger(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function readBoolean(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function optionalString(env: Env, name: string): string | null {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    return null;
  }
  return value.trim();
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/**
 * Hosted Postgres (Supabase) needs TLS. `DATABASE_SSL` wins; otherwise the URL's `sslmode`
 * decides, and production defaults to TLS for any non-local host.
 */
export function resolveDatabaseSsl(databaseUrl: string, explicit: string | null, production: boolean, hasCa: boolean): DatabaseSslMode {
  if (explicit !== null) {
    if (explicit !== "disable" && explicit !== "no-verify" && explicit !== "verify") {
      throw new Error("DATABASE_SSL must be disable, no-verify, or verify");
    }
    return explicit;
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a postgresql:// URL");
  }
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode === "disable") {
    return "disable";
  }
  if (sslmode === "verify-full" || sslmode === "verify-ca") {
    return "verify";
  }
  if (sslmode === "require" || sslmode === "prefer" || sslmode === "no-verify" || url.searchParams.get("ssl") === "true") {
    return hasCa ? "verify" : "no-verify";
  }
  if (production && !isLocalHost(url.hostname)) {
    return hasCa ? "verify" : "no-verify";
  }
  return "disable";
}

export function readWebOrigins(raw: string | null, production: boolean): string[] {
  const configured = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin !== "");
  for (const origin of configured) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`WEB_ORIGIN has an invalid origin: ${origin}`);
    }
    if (parsed.origin !== origin) {
      throw new Error(`WEB_ORIGIN must be an origin like https://app.example.com, not ${origin}`);
    }
  }
  if (production) {
    if (configured.length === 0) {
      throw new Error("WEB_ORIGIN is required in production (the URL of the web panel)");
    }
    return configured;
  }
  return [...new Set([...configured, ...LOCAL_WEB_ORIGINS])];
}

export function readCookieConfig(env: Env, production: boolean): CookieConfig {
  const sameSite = readString(env, "COOKIE_SAME_SITE", production ? "none" : "lax").toLowerCase();
  if (sameSite !== "lax" && sameSite !== "strict" && sameSite !== "none") {
    throw new Error("COOKIE_SAME_SITE must be lax, strict, or none");
  }
  const secure = readBoolean(env, "COOKIE_SECURE", production);
  if (sameSite === "none" && !secure) {
    throw new Error("COOKIE_SAME_SITE=none needs COOKIE_SECURE=true; browsers drop it otherwise");
  }
  return { sameSite, secure, domain: optionalString(env, "COOKIE_DOMAIN") };
}

/** Public sign-up is on in development; off in production unless ALLOW_PUBLIC_REGISTRATION=true. */
export function readRegistrationConfig(env: Env, production: boolean): RegistrationConfig {
  return {
    allowPublic: readBoolean(env, "ALLOW_PUBLIC_REGISTRATION", !production),
    inviteCode: optionalString(env, "REGISTRATION_INVITE_CODE"),
  };
}

/**
 * Open registration, or invite-only when public sign-up is off and REGISTRATION_INVITE_CODE is set.
 * Never returns the invite code itself.
 */
export function registrationStatus(registration: RegistrationConfig): { open: boolean; inviteRequired: boolean } {
  if (registration.allowPublic) {
    return { open: true, inviteRequired: false };
  }
  if (registration.inviteCode !== null) {
    return { open: true, inviteRequired: true };
  }
  return { open: false, inviteRequired: false };
}

export function readServiceAccount(raw: string): ServiceAccountCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON must be the full service account key JSON");
  }
  const account = parsed as Partial<ServiceAccountCredentials> | null;
  if (
    account === null ||
    typeof account !== "object" ||
    typeof account.client_email !== "string" ||
    typeof account.private_key !== "string"
  ) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON must contain client_email and private_key");
  }
  return { ...account, client_email: account.client_email, private_key: account.private_key.replace(/\\n/g, "\n") };
}

export function readExtractorConfig(env: Env): ExtractorConfig {
  const mode = readString(env, "INVOICE_EXTRACTOR", "auto").toLowerCase();
  if (
    mode !== "auto" &&
    mode !== "documentai" &&
    mode !== "openai" &&
    mode !== "anthropic" &&
    mode !== "deepseek" &&
    mode !== "local"
  ) {
    throw new Error("INVOICE_EXTRACTOR must be auto, documentai, openai, anthropic, deepseek, or local");
  }
  const projectId = optionalString(env, "GOOGLE_CLOUD_PROJECT_ID");
  const processorId = optionalString(env, "DOCUMENT_AI_PROCESSOR_ID");
  const credentialsJson = optionalString(env, "GOOGLE_APPLICATION_CREDENTIALS_JSON");
  const documentAi =
    projectId !== null && processorId !== null && credentialsJson !== null
      ? {
          projectId,
          processorId,
          location: readString(env, "DOCUMENT_AI_LOCATION", "eu").toLowerCase(),
          credentials: readServiceAccount(credentialsJson),
        }
      : null;
  const openaiApiKey = optionalString(env, "OPENAI_API_KEY");
  const anthropicApiKey = optionalString(env, "ANTHROPIC_API_KEY");
  const deepseekApiKey = optionalString(env, "DEEPSEEK_API_KEY");
  if (mode === "documentai" && documentAi === null) {
    throw new Error(
      "INVOICE_EXTRACTOR=documentai needs GOOGLE_CLOUD_PROJECT_ID, DOCUMENT_AI_PROCESSOR_ID, and GOOGLE_APPLICATION_CREDENTIALS_JSON",
    );
  }
  if (mode === "openai" && openaiApiKey === null) {
    throw new Error("INVOICE_EXTRACTOR=openai needs OPENAI_API_KEY");
  }
  if (mode === "anthropic" && anthropicApiKey === null) {
    throw new Error("INVOICE_EXTRACTOR=anthropic needs ANTHROPIC_API_KEY");
  }
  if (mode === "deepseek" && deepseekApiKey === null) {
    throw new Error("INVOICE_EXTRACTOR=deepseek needs DEEPSEEK_API_KEY");
  }
  return { mode, openaiApiKey, anthropicApiKey, deepseekApiKey, documentAi };
}

export function loadConfig(env: Env = process.env): AppConfig {
  const databaseUrl = readString(env, "DATABASE_URL", DEFAULT_DATABASE_URL);
  if (env === process.env) {
    process.env.DATABASE_URL = databaseUrl;
  }
  const nodeEnv = readString(env, "NODE_ENV", "development");
  const production = nodeEnv === "production";
  const caCert = optionalString(env, "DATABASE_CA_CERT")?.replace(/\\n/g, "\n") ?? null;

  return {
    nodeEnv,
    host: readString(env, "HOST", "0.0.0.0"),
    port: readInteger(env, "PORT", 43123, 1, 65535),
    databaseUrl,
    database: {
      ssl: resolveDatabaseSsl(databaseUrl, optionalString(env, "DATABASE_SSL"), production, caCert !== null),
      caCert,
      poolMax: readInteger(env, "DATABASE_POOL_MAX", 10, 1, 100),
    },
    redisUrl: readString(env, "REDIS_URL", DEFAULT_REDIS_URL),
    s3: {
      endpoint: readString(env, "S3_ENDPOINT", "http://localhost:59000"),
      region: readString(env, "S3_REGION", "us-east-1"),
      bucket: readString(env, "S3_BUCKET", "matchinvoice"),
      accessKey: readString(env, "S3_ACCESS_KEY", "matchinvoice"),
      secretKey: readString(env, "S3_SECRET_KEY", "matchinvoice-secret"),
      forcePathStyle: readBoolean(env, "S3_FORCE_PATH_STYLE", true),
    },
    openaiApiKey: optionalString(env, "OPENAI_API_KEY"),
    extractor: readExtractorConfig(env),
    webOrigins: readWebOrigins(optionalString(env, "WEB_ORIGIN"), production),
    cookie: readCookieConfig(env, production),
    registration: readRegistrationConfig(env, production),
    trustProxy: readBoolean(env, "TRUST_PROXY", production),
    worker: {
      drainDelaySeconds: readInteger(env, "BULLMQ_DRAIN_DELAY_SECONDS", 5, 1, 3600),
      stalledIntervalMs: readInteger(env, "BULLMQ_STALLED_INTERVAL_MS", 30_000, 5_000, 3_600_000),
    },
  };
}
