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
        extractorModel: true,
        geminiApiKey: true,
        openaiApiKey: true,
        anthropicApiKey: true,
        deepseekApiKey: true,
        documentAiProjectId: true,
        documentAiProcessorId: true,
        documentAiLocation: true,
        documentAiCredentialsJson: true,
      },
    });

    if (org === null) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const customGemini = Boolean(org.geminiApiKey && org.geminiApiKey.trim() !== "");
    const customOpenAi = Boolean(org.openaiApiKey && org.openaiApiKey.trim() !== "");
    const customAnthropic = Boolean(org.anthropicApiKey && org.anthropicApiKey.trim() !== "");
    const customDeepseek = Boolean(org.deepseekApiKey && org.deepseekApiKey.trim() !== "");
    const customDocAi = Boolean(
      org.documentAiProcessorId &&
      org.documentAiProjectId &&
      org.documentAiCredentialsJson,
    );

    return reply.send({
      extractorMode: org.extractorMode ?? "system",
      effectiveMode: org.extractorMode && org.extractorMode !== "system" ? org.extractorMode : systemConfig.mode,
      extractorModel: org.extractorModel ?? null,
      gemini: {
        configured: customGemini || Boolean(systemConfig.geminiApiKey),
        keyPreview: customGemini ? maskKey(org.geminiApiKey!) : (systemConfig.geminiApiKey ? maskKey(systemConfig.geminiApiKey) : null),
        source: customGemini ? "organization" : (systemConfig.geminiApiKey ? "system" : "none"),
      },
      openai: {
        configured: customOpenAi || Boolean(systemConfig.openaiApiKey),
        keyPreview: customOpenAi ? maskKey(org.openaiApiKey!) : (systemConfig.openaiApiKey ? maskKey(systemConfig.openaiApiKey) : null),
        source: customOpenAi ? "organization" : (systemConfig.openaiApiKey ? "system" : "none"),
      },
      anthropic: {
        configured: customAnthropic || Boolean(systemConfig.anthropicApiKey),
        keyPreview: customAnthropic ? maskKey(org.anthropicApiKey!) : (systemConfig.anthropicApiKey ? maskKey(systemConfig.anthropicApiKey) : null),
        source: customAnthropic ? "organization" : (systemConfig.anthropicApiKey ? "system" : "none"),
      },
      deepseek: {
        configured: customDeepseek || Boolean(systemConfig.deepseekApiKey),
        keyPreview: customDeepseek ? maskKey(org.deepseekApiKey!) : (systemConfig.deepseekApiKey ? maskKey(systemConfig.deepseekApiKey) : null),
        source: customDeepseek ? "organization" : (systemConfig.deepseekApiKey ? "system" : "none"),
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
        hasGemini: Boolean(systemConfig.geminiApiKey),
        hasOpenAi: Boolean(systemConfig.openaiApiKey),
        hasAnthropic: Boolean(systemConfig.anthropicApiKey),
        hasDeepseek: Boolean(systemConfig.deepseekApiKey),
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
      extractorModel?: unknown;
      geminiApiKey?: unknown;
      openaiApiKey?: unknown;
      anthropicApiKey?: unknown;
      deepseekApiKey?: unknown;
      documentAiProjectId?: unknown;
      documentAiProcessorId?: unknown;
      documentAiLocation?: unknown;
      documentAiCredentialsJson?: unknown;
    };

    const updateData: {
      extractorMode?: string | null;
      extractorModel?: string | null;
      geminiApiKey?: string | null;
      openaiApiKey?: string | null;
      anthropicApiKey?: string | null;
      deepseekApiKey?: string | null;
      documentAiProjectId?: string | null;
      documentAiProcessorId?: string | null;
      documentAiLocation?: string | null;
      documentAiCredentialsJson?: string | null;
    } = {};

    if (body.extractorMode !== undefined) {
      const mode = typeof body.extractorMode === "string" ? body.extractorMode.trim().toLowerCase() : null;
      if (
        mode !== null &&
        mode !== "" &&
        mode !== "system" &&
        mode !== "auto" &&
        mode !== "gemini" &&
        mode !== "documentai" &&
        mode !== "openai" &&
        mode !== "anthropic" &&
        mode !== "deepseek" &&
        mode !== "local"
      ) {
        return reply.code(400).send({
          error: "El mode d'extracció ha de ser: system, auto, gemini, documentai, openai, anthropic, deepseek o local",
        });
      }
      updateData.extractorMode = mode === "system" || mode === "" ? null : mode;
    }

    if (body.extractorModel !== undefined) {
      if (body.extractorModel === null || body.extractorModel === "") {
        updateData.extractorModel = null;
      } else if (typeof body.extractorModel === "string") {
        updateData.extractorModel = body.extractorModel.trim();
      }
    }

    if (body.geminiApiKey !== undefined) {
      if (body.geminiApiKey === null || body.geminiApiKey === "") {
        updateData.geminiApiKey = null;
      } else if (typeof body.geminiApiKey === "string") {
        updateData.geminiApiKey = body.geminiApiKey.trim();
      }
    }

    if (body.openaiApiKey !== undefined) {
      if (body.openaiApiKey === null || body.openaiApiKey === "") {
        updateData.openaiApiKey = null;
      } else if (typeof body.openaiApiKey === "string") {
        updateData.openaiApiKey = body.openaiApiKey.trim();
      }
    }

    if (body.anthropicApiKey !== undefined) {
      if (body.anthropicApiKey === null || body.anthropicApiKey === "") {
        updateData.anthropicApiKey = null;
      } else if (typeof body.anthropicApiKey === "string") {
        updateData.anthropicApiKey = body.anthropicApiKey.trim();
      }
    }

    if (body.deepseekApiKey !== undefined) {
      if (body.deepseekApiKey === null || body.deepseekApiKey === "") {
        updateData.deepseekApiKey = null;
      } else if (typeof body.deepseekApiKey === "string") {
        updateData.deepseekApiKey = body.deepseekApiKey.trim();
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
        extractorModel: true,
        geminiApiKey: true,
        openaiApiKey: true,
        anthropicApiKey: true,
        deepseekApiKey: true,
        documentAiProjectId: true,
        documentAiProcessorId: true,
        documentAiLocation: true,
        documentAiCredentialsJson: true,
      },
    });

    const customGemini = Boolean(updated.geminiApiKey && updated.geminiApiKey.trim() !== "");
    const customOpenAi = Boolean(updated.openaiApiKey && updated.openaiApiKey.trim() !== "");
    const customAnthropic = Boolean(updated.anthropicApiKey && updated.anthropicApiKey.trim() !== "");
    const customDeepseek = Boolean(updated.deepseekApiKey && updated.deepseekApiKey.trim() !== "");
    const customDocAi = Boolean(
      updated.documentAiProcessorId &&
      updated.documentAiProjectId &&
      updated.documentAiCredentialsJson,
    );

    return reply.send({
      extractorMode: updated.extractorMode ?? "system",
      effectiveMode: updated.extractorMode && updated.extractorMode !== "system" ? updated.extractorMode : systemConfig.mode,
      extractorModel: updated.extractorModel ?? null,
      gemini: {
        configured: customGemini || Boolean(systemConfig.geminiApiKey),
        keyPreview: customGemini ? maskKey(updated.geminiApiKey!) : (systemConfig.geminiApiKey ? maskKey(systemConfig.geminiApiKey) : null),
        source: customGemini ? "organization" : (systemConfig.geminiApiKey ? "system" : "none"),
      },
      openai: {
        configured: customOpenAi || Boolean(systemConfig.openaiApiKey),
        keyPreview: customOpenAi ? maskKey(updated.openaiApiKey!) : (systemConfig.openaiApiKey ? maskKey(systemConfig.openaiApiKey) : null),
        source: customOpenAi ? "organization" : (systemConfig.openaiApiKey ? "system" : "none"),
      },
      anthropic: {
        configured: customAnthropic || Boolean(systemConfig.anthropicApiKey),
        keyPreview: customAnthropic ? maskKey(updated.anthropicApiKey!) : (systemConfig.anthropicApiKey ? maskKey(systemConfig.anthropicApiKey) : null),
        source: customAnthropic ? "organization" : (systemConfig.anthropicApiKey ? "system" : "none"),
      },
      deepseek: {
        configured: customDeepseek || Boolean(systemConfig.deepseekApiKey),
        keyPreview: customDeepseek ? maskKey(updated.deepseekApiKey!) : (systemConfig.deepseekApiKey ? maskKey(systemConfig.deepseekApiKey) : null),
        source: customDeepseek ? "organization" : (systemConfig.deepseekApiKey ? "system" : "none"),
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
        hasGemini: Boolean(systemConfig.geminiApiKey),
        hasOpenAi: Boolean(systemConfig.openaiApiKey),
        hasAnthropic: Boolean(systemConfig.anthropicApiKey),
        hasDeepseek: Boolean(systemConfig.deepseekApiKey),
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

    if (body.provider === "gemini") {
      const candidateKey = typeof body.apiKey === "string" && body.apiKey.trim() !== ""
        ? body.apiKey.trim()
        : (org.geminiApiKey ?? systemConfig.geminiApiKey);

      if (!candidateKey) {
        return reply.code(400).send({ ok: false, error: "No hi ha cap clau de Google Gemini per provar." });
      }

      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(candidateKey)}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          const err = await res.text();
          return reply.code(400).send({ ok: false, error: `Error de Google Gemini (${res.status}): ${err}` });
        }
        return reply.send({ ok: true, message: "Connexió amb Google Gemini API confirmada correctament." });
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "Error provant la clau de Google Gemini.";
        return reply.code(400).send({ ok: false, error: msg });
      }
    }

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

    if (body.provider === "anthropic") {
      const candidateKey = typeof body.apiKey === "string" && body.apiKey.trim() !== ""
        ? body.apiKey.trim()
        : (org.anthropicApiKey ?? systemConfig.anthropicApiKey);

      if (!candidateKey) {
        return reply.code(400).send({ ok: false, error: "No hi ha cap clau d'Anthropic per provar." });
      }

      try {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": candidateKey,
            "anthropic-version": "2023-06-01",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          const err = await res.text();
          return reply.code(400).send({ ok: false, error: `Error d'Anthropic (${res.status}): ${err}` });
        }
        return reply.send({ ok: true, message: "Connexió amb Anthropic confirmada correctament." });
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "Error provant la clau d'Anthropic.";
        return reply.code(400).send({ ok: false, error: msg });
      }
    }

    if (body.provider === "deepseek") {
      const candidateKey = typeof body.apiKey === "string" && body.apiKey.trim() !== ""
        ? body.apiKey.trim()
        : (org.deepseekApiKey ?? systemConfig.deepseekApiKey);

      if (!candidateKey) {
        return reply.code(400).send({ ok: false, error: "No hi ha cap clau de DeepSeek per provar." });
      }

      try {
        const client = new OpenAI({ apiKey: candidateKey, baseURL: "https://api.deepseek.com", timeout: 8000 });
        await client.models.list();
        return reply.send({ ok: true, message: "Connexió amb DeepSeek confirmada correctament." });
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "Error provant la clau de DeepSeek.";
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

    return reply.code(400).send({ error: "El proveïdor ha de ser 'gemini', 'openai', 'anthropic', 'deepseek' o 'documentai'." });
  });
}
