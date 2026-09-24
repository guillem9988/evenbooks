import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { buildAccountantExport, parseExportRange, type ExportObjectStore } from "../reports/accountant-export.js";

const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerReportRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  store: ExportObjectStore,
): void {
  app.get("/organizations/:organizationId/reports/accountant-export", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    if (!ORGANIZATION_ID.test(organizationId)) {
      return reply.code(400).send({ error: "organizationId must be a UUID" });
    }

    const query = request.query as { from?: string; to?: string };
    const range = parseExportRange(query.from, query.to);
    if (typeof range === "string") {
      return reply.code(400).send({ error: range });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (organization === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const archive = await buildAccountantExport(prisma, store, organizationId, range.from, range.to);
    return reply
      .code(200)
      .header("content-type", "application/zip")
      .header("content-disposition", "attachment; filename=\"accountant-export.zip\"")
      .send(archive.body);
  });
}
