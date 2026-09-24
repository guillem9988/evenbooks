import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/client.js";

export interface Database {
  prisma: PrismaClient;
  close: () => Promise<void>;
}

export function createDatabase(
  databaseUrl: string,
  onPoolError?: (error: Error) => void,
): Database {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
    max: 10,
  });
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
