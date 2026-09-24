import type { FastifyInstance } from "fastify";
import type { PrismaClient, TaxRateType } from "../../generated/prisma/client.js";
import { enumToRate, parseCents, parseTaxPercent, rateToEnum } from "../billing/lines.js";
import { cents, findOrganization, readUuid } from "./org-params.js";

export function registerCatalogRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/organizations/:organizationId/catalog", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const items = await prisma.catalogItem.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
    return reply.send({ items: items.map(presentItem) });
  });

  app.post("/organizations/:organizationId/catalog", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    const parsed = readItem(request.body);
    if (parsed instanceof Error) {
      return reply.code(400).send({ error: parsed.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const created = await prisma.catalogItem.create({
      data: { organizationId, ...parsed },
    });
    return reply.code(201).send(presentItem(created));
  });

  app.patch("/organizations/:organizationId/catalog/:itemId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const itemId = readUuid((request.params as { itemId?: string }).itemId, "itemId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (itemId instanceof Error) {
      return reply.code(400).send({ error: itemId.message });
    }
    const parsed = readItem(request.body);
    if (parsed instanceof Error) {
      return reply.code(400).send({ error: parsed.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const existing = await prisma.catalogItem.findFirst({ where: { id: itemId, organizationId } });
    if (existing === null) {
      return reply.code(404).send({ error: "Catalog item not found" });
    }
    const updated = await prisma.catalogItem.update({ where: { id: existing.id }, data: parsed });
    return reply.send(presentItem(updated));
  });

  app.delete("/organizations/:organizationId/catalog/:itemId", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    const itemId = readUuid((request.params as { itemId?: string }).itemId, "itemId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }
    if (itemId instanceof Error) {
      return reply.code(400).send({ error: itemId.message });
    }
    if ((await findOrganization(prisma, organizationId)) === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }
    const existing = await prisma.catalogItem.findFirst({ where: { id: itemId, organizationId } });
    if (existing === null) {
      return reply.code(404).send({ error: "Catalog item not found" });
    }
    await prisma.catalogItem.delete({ where: { id: existing.id } });
    return reply.code(204).send();
  });
}

function readItem(body: unknown): { name: string; unitAmountCents: bigint; taxRate: TaxRateType } | Error {
  const value = body as { name?: unknown; unitAmountCents?: unknown; taxRate?: unknown };
  if (typeof value?.name !== "string" || value.name.trim() === "") {
    return new Error("name is required");
  }
  const unitAmountCents = parseCents(value.unitAmountCents);
  const taxRate = parseTaxPercent(value.taxRate);
  if (unitAmountCents === null || taxRate === null) {
    return new Error("unitAmountCents must be integer cents and taxRate must be 21, 10, 4, or 0");
  }
  return {
    name: value.name.trim().slice(0, 255),
    unitAmountCents,
    taxRate: rateToEnum(taxRate),
  };
}

function presentItem(row: { id: string; name: string; unitAmountCents: bigint; taxRate: TaxRateType }) {
  return {
    id: row.id,
    name: row.name,
    unitAmountCents: cents(row.unitAmountCents),
    taxRate: enumToRate(row.taxRate),
  };
}
