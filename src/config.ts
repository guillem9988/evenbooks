import "dotenv/config";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  s3: S3Config;
  openaiApiKey: string | null;
}

const DEFAULT_DATABASE_URL =
  "postgresql://matchinvoice:matchinvoice@localhost:54329/matchinvoice";
const DEFAULT_REDIS_URL = "redis://localhost:63799";

function readString(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return value;
}

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be an integer port between 1 and 65535`);
  }
  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  if (raw === "true" || raw === "1") {
    return true;
  }
  if (raw === "false" || raw === "0") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

export function loadConfig(): AppConfig {
  const databaseUrl = readString("DATABASE_URL", DEFAULT_DATABASE_URL);
  process.env.DATABASE_URL = databaseUrl;

  return {
    nodeEnv: readString("NODE_ENV", "development"),
    host: readString("HOST", "0.0.0.0"),
    port: readPort("PORT", 43123),
    databaseUrl,
    redisUrl: readString("REDIS_URL", DEFAULT_REDIS_URL),
    s3: {
      endpoint: readString("S3_ENDPOINT", "http://localhost:59000"),
      region: readString("S3_REGION", "us-east-1"),
      bucket: readString("S3_BUCKET", "matchinvoice"),
      accessKey: readString("S3_ACCESS_KEY", "matchinvoice"),
      secretKey: readString("S3_SECRET_KEY", "matchinvoice-secret"),
      forcePathStyle: readBoolean("S3_FORCE_PATH_STYLE", true),
    },
    openaiApiKey: optionalString("OPENAI_API_KEY"),
  };
}

function optionalString(name: string): string | null {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return null;
  }
  return value;
}
