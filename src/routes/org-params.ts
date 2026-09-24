import type { PrismaClient } from "../../generated/prisma/client.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readUuid(value: string | undefined, name: string): string | Error {
  if (value === undefined || !UUID.test(value)) {
    return new Error(`${name} must be a UUID`);
  }
  return value;
}

export function findOrganization(prisma: PrismaClient, id: string) {
  return prisma.organization.findUnique({ where: { id }, select: { id: true } });
}

export function cents(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

export function day(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

export function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, dayOfMonth] = value.split("-").map(Number);
  if (year === undefined || month === undefined || dayOfMonth === undefined) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== dayOfMonth) {
    return null;
  }
  return date;
}
