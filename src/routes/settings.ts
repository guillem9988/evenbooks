import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { readServiceAccount, type ExtractorConfig } from "../config.js";
import { readUuid } from "./org-params.js";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function extractClientEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: unknown };
    return typeof parsed.client_email === "string" ? parsed.client_email : null;
  } catch {
    return null;
  }
}

export function registerSettingsRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  systemConfig: ExtractorConfig,
): void {
  app.get("/organizations/:organizationId/settings/extractor", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        extractorMode: true,
        openaiApiKey: true,
        documentAiProjectId: true,
        documentAiProcessorId: true,
        documentAiLocation: true,
        documentAiCredentialsJson: true,
      },
    });

    if (org === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const customOpenAi = Boolean(org.openaiApiKey && org.openaiApiKey.trim() !== "");
    const customDocAi = Boolean(
      org.documentAiProcessorId &&
      org.documentAiProjectId &&
      org.documentAiCredentialsJson,
    );

    return reply.send({
      extractorMode: org.extractorMode ?? "system",
      effectiveMode: org.extractorMode && org.extractorMode !== "system" ? org.extractorMode : systemConfig.mode,
      openai: {
        configured: customOpenAi || Boolean(systemConfig.openaiApiKey),
        keyPreview: customOpenAi ? maskKey(org.openaiApiKey!) : (systemConfig.openaiApiKey ? maskKey(systemConfig.openaiApiKey) : null),
        source: customOpenAi ? "organization" : (systemConfig.openaiApiKey ? "system" : "none"),
      },
      documentAi: {
        configured: customDocAi || Boolean(systemConfig.documentAi),
        projectId: org.documentAiProjectId ?? systemConfig.documentAi?.projectId ?? null,
        processorId: org.documentAiProcessorId ? maskKey(org.documentAiProcessorId) : (systemConfig.documentAi ? maskKey(systemConfig.documentAi.processorId) : null),
        location: org.documentAiLocation ?? systemConfig.documentAi?.location ?? "eu",
        clientEmail: extractClientEmail(org.documentAiCredentialsJson) ?? systemConfig.documentAi?.credentials.client_email ?? null,
        source: customDocAi ? "organization" : (systemConfig.documentAi ? "system" : "none"),
      },
      systemDefaults: {
        hasOpenAi: Boolean(systemConfig.openaiApiKey),
        hasDocumentAi: Boolean(systemConfig.documentAi),
        mode: systemConfig.mode,
      },
    });
  });

  app.put("/organizations/:organizationId/settings/extractor", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }

    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (org === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const body = request.body as {
      extractorMode?: unknown;
      openaiApiKey?: unknown;
      documentAiProjectId?: unknown;
      documentAiProcessorId?: unknown;
      documentAiLocation?: unknown;
      documentAiCredentialsJson?: unknown;
    };

    const updateData: {
      extractorMode?: string | null;
      openaiApiKey?: string | null;
      documentAiProjectId?: string | null;
      documentAiProcessorId?: string | null;
      documentAiLocation?: string | null;
      documentAiCredentialsJson?: string | null;
    } = {};

    if (body.extractorMode !== undefined) {
      const mode = typeof body.extractorMode === "string" ? body.extractorMode.trim().toLowerCase() : null;
      if (mode !== null && mode !== "" && mode !== "system" && mode !== "auto" && mode !== "documentai" && mode !== "openai" && mode !== "local") {
        return reply.code(400).send({ error: "El mode d'extracció ha de ser: system, auto, documentai, openai o local" });
      }
      updateData.extractorMode = mode === "system" || mode === "" ? null : mode;
    }

    if (body.openaiApiKey !== undefined) {
      if (body.openaiApiKey === null || body.openaiApiKey === "") {
        updateData.openaiApiKey = null;
      } else if (typeof body.openaiApiKey === "string") {
        updateData.openaiApiKey = body.openaiApiKey.trim();
      }
    }

    if (body.documentAiProjectId !== undefined) {
      updateData.documentAiProjectId = typeof body.documentAiProjectId === "string" && body.documentAiProjectId.trim() !== ""
        ? body.documentAiProjectId.trim()
        : null;
    }

    if (body.documentAiProcessorId !== undefined) {
      updateData.documentAiProcessorId = typeof body.documentAiProcessorId === "string" && body.documentAiProcessorId.trim() !== ""
        ? body.documentAiProcessorId.trim()
        : null;
    }

    if (body.documentAiLocation !== undefined) {
      updateData.documentAiLocation = typeof body.documentAiLocation === "string" && body.documentAiLocation.trim() !== ""
        ? body.documentAiLocation.trim().toLowerCase()
        : null;
    }

    if (body.documentAiCredentialsJson !== undefined) {
      if (body.documentAiCredentialsJson === null || body.documentAiCredentialsJson === "") {
        updateData.documentAiCredentialsJson = null;
      } else if (typeof body.documentAiCredentialsJson === "string") {
        try {
          readServiceAccount(body.documentAiCredentialsJson.trim());
          updateData.documentAiCredentialsJson = body.documentAiCredentialsJson.trim();
        } catch (error) {
          const msg = error instanceof Error ? error.message : "El fitxer JSON de credencials no és vàlid.";
          return reply.code(400).send({ error: msg });
        }
      }
    }

    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
      select: {
        id: true,
        extractorMode: true,
        openaiApiKey: true,
        documentAiProjectId: true,
        documentAiProcessorId: true,
        documentAiLocation: true,
        documentAiCredentialsJson: true,
      },
    });

    const customOpenAi = Boolean(updated.openaiApiKey && updated.openaiApiKey.trim() !== "");
    const customDocAi = Boolean(
      updated.documentAiProcessorId &&
      updated.documentAiProjectId &&
      updated.documentAiCredentialsJson,
    );

    return reply.send({
      extractorMode: updated.extractorMode ?? "system",
      effectiveMode: updated.extractorMode && updated.extractorMode !== "system" ? updated.extractorMode : systemConfig.mode,
      openai: {
        configured: customOpenAi || Boolean(systemConfig.openaiApiKey),
        keyPreview: customOpenAi ? maskKey(updated.openaiApiKey!) : (systemConfig.openaiApiKey ? maskKey(systemConfig.openaiApiKey) : null),
        source: customOpenAi ? "organization" : (systemConfig.openaiApiKey ? "system" : "none"),
      },
      documentAi: {
        configured: customDocAi || Boolean(systemConfig.documentAi),
        projectId: updated.documentAiProjectId ?? systemConfig.documentAi?.projectId ?? null,
        processorId: updated.documentAiProcessorId ? maskKey(updated.documentAiProcessorId) : (systemConfig.documentAi ? maskKey(systemConfig.documentAi.processorId) : null),
        location: updated.documentAiLocation ?? systemConfig.documentAi?.location ?? "eu",
        clientEmail: extractClientEmail(updated.documentAiCredentialsJson) ?? systemConfig.documentAi?.credentials.client_email ?? null,
        source: customDocAi ? "organization" : (systemConfig.documentAi ? "system" : "none"),
      },
      systemDefaults: {
        hasOpenAi: Boolean(systemConfig.openaiApiKey),
        hasDocumentAi: Boolean(systemConfig.documentAi),
        mode: systemConfig.mode,
      },
    });
  });

  app.post("/organizations/:organizationId/settings/extractor/test", async (request, reply) => {
    const organizationId = readUuid((request.params as { organizationId?: string }).organizationId, "organizationId");
    if (organizationId instanceof Error) {
      return reply.code(400).send({ error: organizationId.message });
    }

    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (org === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const body = request.body as {
      provider?: unknown;
      apiKey?: unknown;
      documentAi?: {
        projectId?: unknown;
        processorId?: unknown;
        location?: unknown;
        credentialsJson?: unknown;
      };
    };

    if (body.provider === "openai") {
      const candidateKey = typeof body.apiKey === "string" && body.apiKey.trim() !== ""
        ? body.apiKey.trim()
        : (org.openaiApiKey ?? systemConfig.openaiApiKey);

      if (!candidateKey) {
        return reply.code(400).send({ ok: false, error: "No hi ha cap clau d'OpenAI per provar." });
      }

      try {
        const client = new OpenAI({ apiKey: candidateKey, timeout: 8000 });
        await client.models.list();
        return reply.send({ ok: true, message: "Connexió amb OpenAI confirmada correctament." });
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "Error provant la clau d'OpenAI.";
        return reply.code(400).send({ ok: false, error: msg });
      }
    }

    if (body.provider === "documentai") {
      const rawCreds = typeof body.documentAi?.credentialsJson === "string" && body.documentAi.credentialsJson.trim() !== ""
        ? body.documentAi.credentialsJson.trim()
        : org.documentAiCredentialsJson;

      if (!rawCreds) {
        return reply.code(400).send({ ok: false, error: "Cal el JSON de credencials del compte de servei." });
      }

      let creds;
      try {
        creds = readServiceAccount(rawCreds);
      } catch (err) {
        return reply.code(400).send({ ok: false, error: err instanceof Error ? err.message : "JSON de credencials invàlid." });
      }

      const projectId = typeof body.documentAi?.projectId === "string" && body.documentAi.projectId.trim() !== ""
        ? body.documentAi.projectId.trim()
        : (org.documentAiProjectId ?? systemConfig.documentAi?.projectId);

      const processorId = typeof body.documentAi?.processorId === "string" && body.documentAi.processorId.trim() !== ""
        ? body.documentAi.processorId.trim()
        : (org.documentAiProcessorId ?? systemConfig.documentAi?.processorId);

      const location = typeof body.documentAi?.location === "string" && body.documentAi.location.trim() !== ""
        ? body.documentAi.location.trim().toLowerCase()
        : (org.documentAiLocation ?? systemConfig.documentAi?.location ?? "eu");

      if (!projectId || !processorId) {
        return reply.code(400).send({ ok: false, error: "Cal indicar Project ID i Processor ID." });
      }

      try {
        const client = new DocumentProcessorServiceClient({
          apiEndpoint: `${location}-documentai.googleapis.com`,
          credentials: { client_email: creds.client_email, private_key: creds.private_key },
        });
        const name = client.processorPath(projectId, location, processorId);
        await client.getProcessor({ name }, { timeout: 8000 });
        return reply.send({ ok: true, message: "Connexió amb Google Document AI confirmada correctament." });
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "Error connectant amb Document AI.";
        return reply.code(400).send({ ok: false, error: msg });
      }
    }

    return reply.code(400).send({ error: "El proveïdor ha de ser 'openai' o 'documentai'." });
  });
}
