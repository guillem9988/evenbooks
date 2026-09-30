import { InvoiceStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { ExtractorConfig, InvoiceExtractorMode } from "../config.js";
import { readServiceAccount } from "../config.js";
import { reconcileOrganization } from "../matching/reconcile.js";
import { documentAiExtract } from "./document-ai.js";
import {
  ExtractionError,
  extractInvoice,
  extractInvoiceWithAnthropic,
  extractInvoiceWithDeepseek,
  readLabeledText,
  type ExtractedInvoice,
} from "./extract.js";
import { recognizeImage, renderPdfPage } from "./ocr.js";
import { extractPdfText } from "./pdf-text.js";

export interface InvoiceObjectStore {
  get(key: string): Promise<Buffer>;
}

const TEXT_LAYER_MIN = 20;
const OCR_GAP = "Tesseract did not find a usable total, date, or vendor.";

export type ImageRecognizer = (bytes: Buffer) => Promise<string>;

export type ExtractorName = "document-ai" | "openai" | "anthropic" | "deepseek" | "local";

const LABELS: Record<ExtractorName, string> = {
  "document-ai": "Document AI",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  deepseek: "DeepSeek",
  local: "Local parser",
};

export const LOCAL_EXTRACTOR: ExtractorConfig = {
  mode: "local",
  openaiApiKey: null,
  anthropicApiKey: null,
  deepseekApiKey: null,
  documentAi: null,
};

/**
 * Document AI, then OpenAI, Anthropic, DeepSeek, then the local text parser and Tesseract. Providers without
 * credentials are skipped; an explicit INVOICE_EXTRACTOR only chooses where the chain starts.
 */
export function extractorChain(config: ExtractorConfig): ExtractorName[] {
  const available: ExtractorName[] = [];
  if (config.documentAi !== null) available.push("document-ai");
  if (config.openaiApiKey !== null) available.push("openai");
  if (config.anthropicApiKey !== null) available.push("anthropic");
  if (config.deepseekApiKey !== null) available.push("deepseek");
  available.push("local");
  const start: ExtractorName =
    config.mode === "documentai"
      ? "document-ai"
      : config.mode === "openai"
        ? "openai"
        : config.mode === "anthropic"
          ? "anthropic"
          : config.mode === "deepseek"
            ? "deepseek"
            : config.mode === "local"
              ? "local"
              : available[0]!;
  const index = available.indexOf(start);
  return index === -1 ? available : available.slice(index);
}

export function resolveEffectiveExtractor(
  org: {
    extractorMode?: string | null;
    openaiApiKey?: string | null;
    anthropicApiKey?: string | null;
    deepseekApiKey?: string | null;
    documentAiProjectId?: string | null;
    documentAiProcessorId?: string | null;
    documentAiLocation?: string | null;
    documentAiCredentialsJson?: string | null;
  } | null | undefined,
  systemConfig: ExtractorConfig,
): ExtractorConfig {
  const customMode = org?.extractorMode?.trim().toLowerCase();
  const validModes: InvoiceExtractorMode[] = ["auto", "documentai", "openai", "anthropic", "deepseek", "local"];
  const mode: InvoiceExtractorMode =
    customMode && validModes.includes(customMode as InvoiceExtractorMode)
      ? (customMode as InvoiceExtractorMode)
      : systemConfig.mode;

  const openaiApiKey =
    org?.openaiApiKey && org.openaiApiKey.trim() !== ""
      ? org.openaiApiKey.trim()
      : systemConfig.openaiApiKey;

  const anthropicApiKey =
    org?.anthropicApiKey && org.anthropicApiKey.trim() !== ""
      ? org.anthropicApiKey.trim()
      : systemConfig.anthropicApiKey;

  const deepseekApiKey =
    org?.deepseekApiKey && org.deepseekApiKey.trim() !== ""
      ? org.deepseekApiKey.trim()
      : systemConfig.deepseekApiKey;

  let documentAi = systemConfig.documentAi;
  if (
    org?.documentAiProjectId?.trim() &&
    org?.documentAiProcessorId?.trim() &&
    org?.documentAiCredentialsJson?.trim()
  ) {
    try {
      const credentials = readServiceAccount(org.documentAiCredentialsJson.trim());
      documentAi = {
        projectId: org.documentAiProjectId.trim(),
        processorId: org.documentAiProcessorId.trim(),
        location: (org.documentAiLocation?.trim() || "eu").toLowerCase(),
        credentials,
      };
    } catch {
      documentAi = systemConfig.documentAi;
    }
  }

  return { mode, openaiApiKey, anthropicApiKey, deepseekApiKey, documentAi };
}

export async function processInvoiceJob(
  prisma: PrismaClient,
  store: InvoiceObjectStore,
  invoiceId: string,
  systemExtractor: ExtractorConfig,
  recognize: ImageRecognizer = recognizeImage,
): Promise<void> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { organization: true },
    });
    if (invoice === null || invoice.status === InvoiceStatus.PARSED) {
      return;
    }
    const extractor = resolveEffectiveExtractor(invoice.organization, systemExtractor);
    const bytes = await store.get(invoice.storageKey);
    const isPdf = invoice.mimeType === "application/pdf";
    const text = isPdf ? await extractPdfText(bytes) : null;
    const hasText = text !== null && text.trim().length >= TEXT_LAYER_MIN;
    const file: InvoiceFile = { bytes, mimeType: invoice.mimeType, isPdf, text: hasText ? text : null };
    const extracted = await extractWithChain(extractor, file, recognize);
    await saveParsed(prisma, invoice.id, extracted);
    await reconcileOrganization(prisma, invoice.organizationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice extraction failed";
    await prisma.invoice
      .update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.FAILED, errorMessage: message.slice(0, 2000) },
      })
      .catch(() => undefined);
  }
}

interface InvoiceFile {
  bytes: Buffer;
  mimeType: string;
  isPdf: boolean;
  text: string | null;
}

async function extractWithChain(
  config: ExtractorConfig,
  file: InvoiceFile,
  recognize: ImageRecognizer,
): Promise<ExtractedInvoice> {
  const chain = extractorChain(config);
  const failures: string[] = [];
  for (const name of chain) {
    try {
      const extracted = await runExtractor(name, config, file, recognize);
      if (failures.length === 0) {
        return extracted;
      }
      return { ...extracted, raw: { result: extracted.raw, fallbackFrom: failures } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "extraction failed";
      failures.push(`${LABELS[name]}: ${message}`);
    }
  }
  throw new ExtractionError(chain.length === 1 ? failures[0]!.replace(/^[^:]+: /, "") : failures.join(" | "));
}

async function runExtractor(
  name: ExtractorName,
  config: ExtractorConfig,
  file: InvoiceFile,
  recognize: ImageRecognizer,
): Promise<ExtractedInvoice> {
  if (name === "document-ai") {
    if (config.documentAi === null) {
      throw new ExtractionError("Document AI is not configured.");
    }
    return documentAiExtract(config.documentAi, file);
  }
  if (name === "openai") {
    if (config.openaiApiKey === null) {
      throw new ExtractionError("OPENAI_API_KEY is not set.");
    }
    return file.text !== null
      ? extractInvoice({ text: file.text, image: null, apiKey: config.openaiApiKey })
      : extractInvoice({ text: null, image: { mediaType: file.mimeType, bytes: file.bytes }, apiKey: config.openaiApiKey });
  }
  if (name === "anthropic") {
    if (config.anthropicApiKey === null) {
      throw new ExtractionError("ANTHROPIC_API_KEY is not set.");
    }
    return file.text !== null
      ? extractInvoiceWithAnthropic({ text: file.text, image: null, apiKey: config.anthropicApiKey })
      : extractInvoiceWithAnthropic({ text: null, image: { mediaType: file.mimeType, bytes: file.bytes }, apiKey: config.anthropicApiKey });
  }
  if (name === "deepseek") {
    if (config.deepseekApiKey === null) {
      throw new ExtractionError("DEEPSEEK_API_KEY is not set.");
    }
    if (file.text !== null) {
      return extractInvoiceWithDeepseek({ text: file.text, apiKey: config.deepseekApiKey });
    }
    const image = file.isPdf ? await renderPdfPage(file.bytes) : file.bytes;
    const ocrText = await recognize(image);
    return extractInvoiceWithDeepseek({ text: ocrText, apiKey: config.deepseekApiKey });
  }
  if (file.text !== null) {
    return extractInvoice({ text: file.text, image: null, apiKey: null });
  }
  const image = file.isPdf ? await renderPdfPage(file.bytes) : file.bytes;
  const ocrText = await recognize(image);
  const fields = readLabeledText(ocrText);
  if (fields.total_amount === null || fields.invoice_date === null || fields.vendor_name === null) {
    throw new ExtractionError(OCR_GAP);
  }
  return extractInvoice({ text: ocrText, image: null, apiKey: null });
}

async function saveParsed(prisma: PrismaClient, invoiceId: string, extracted: ExtractedInvoice): Promise<void> {
  if (typeof extracted.totalAmountCents !== "bigint") {
    throw new ExtractionError("Total amount must be integer cents.");
  }
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.PARSED,
      vendorName: extracted.vendorName,
      vendorTaxId: extracted.vendorTaxId,
      invoiceNumber: extracted.invoiceNumber,
      invoiceDate: extracted.invoiceDate,
      currency: extracted.currency,
      baseAmountCents: extracted.baseAmountCents,
      taxAmountCents: extracted.taxAmountCents,
      totalAmountCents: extracted.totalAmountCents,
      taxRate: extracted.taxRate,
      isSimplified: extracted.isSimplified,
      errorMessage: null,
      ocrRawResponse: JSON.parse(
        JSON.stringify(extracted.raw, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value)),
      ) as Prisma.InputJsonValue,
    },
  });
}
