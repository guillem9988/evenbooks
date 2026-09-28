import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolConfig } from "pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import type { DatabaseConfig } from "../config.js";

export interface Database {
  prisma: PrismaClient;
  close: () => Promise<void>;
}

const SSL_PARAMS = ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat", "sslaccept", "pgbouncer", "connection_limit"];

/**
 * node-postgres lets `sslmode` in the URL override the `ssl` option, and treats `require`
 * as full verification. Supabase's pooler certificate is signed by Supabase's own CA, so the
 * TLS settings are stripped from the URL and passed explicitly instead.
 */
export function poolConfig(databaseUrl: string, database: DatabaseConfig = { ssl: "disable", caCert: null, poolMax: 10 }): PoolConfig {
  const url = new URL(databaseUrl);
  for (const param of SSL_PARAMS) {
    url.searchParams.delete(param);
  }
  const ssl =
    database.ssl === "disable"
      ? undefined
      : database.ssl === "verify"
        ? { rejectUnauthorized: true, ...(database.caCert ? { ca: database.caCert } : {}) }
        : { rejectUnauthorized: false };
  return {
    connectionString: url.toString(),
    connectionTimeoutMillis: 5_000,
    max: database.poolMax,
    ...(ssl ? { ssl } : {}),
  };
}

export function createDatabase(
  databaseUrl: string,
  onPoolError?: (error: Error) => void,
  database?: DatabaseConfig,
): Database {
  const pool = new Pool(poolConfig(databaseUrl, database));
  pool.on("error", (error: Error) => {
    onPoolError?.(error);
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  return {
    prisma,
    close: async () => {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}

export async function checkPostgres(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ ok: number | bigint }>>`SELECT 1 AS ok`;
  const value = rows[0]?.ok;
  if (value !== 1 && value !== 1n) {
    throw new Error("Postgres health query returned an unexpected result");
  }
}
