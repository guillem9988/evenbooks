import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import type { DocumentAiConfig } from "../config.js";
import { parseBankAmount } from "../statements/parse-csv.js";
import { ExtractionError, mapTaxRate, type ExtractedInvoice } from "./extract.js";

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/gif",
  "image/bmp",
  "image/webp",
]);

const TAX_RATES = [21n, 10n, 4n, 0n];

interface Money {
  currencyCode?: string | null;
  units?: number | string | { toString(): string } | null;
  nanos?: number | null;
}

interface DateValue {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface DocumentAiEntity {
  type?: string | null;
  mentionText?: string | null;
  confidence?: number | null;
  normalizedValue?: {
    text?: string | null;
    moneyValue?: Money | null;
    dateValue?: DateValue | null;
  } | null;
  properties?: DocumentAiEntity[] | null;
}

export interface DocumentAiDocument {
  entities?: DocumentAiEntity[] | null;
}

export async function documentAiExtract(
  settings: DocumentAiConfig,
  file: { bytes: Buffer; mimeType: string },
): Promise<ExtractedInvoice> {
  if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) {
    throw new ExtractionError(`Document AI does not accept ${file.mimeType} files.`);
  }
  const client = new DocumentProcessorServiceClient({
    apiEndpoint: `${settings.location}-documentai.googleapis.com`,
    projectId: settings.projectId,
    credentials: settings.credentials,
  });
  try {
    const [result] = await client.processDocument({
      name: client.processorPath(settings.projectId, settings.location, settings.processorId),
      rawDocument: { content: file.bytes.toString("base64"), mimeType: file.mimeType },
    });
    const document = result.document;
    if (document === null || document === undefined) {
      throw new ExtractionError("Document AI returned no document.");
    }
    return fromDocumentAi(document as DocumentAiDocument);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function fromDocumentAi(document: DocumentAiDocument): ExtractedInvoice {
  const entities = document.entities ?? [];
  const total = amountOf(pick(entities, "total_amount"));
  if (total === null) {
    throw new ExtractionError("Document AI did not find total_amount. Totals are never guessed.");
  }
  const net = amountOf(pick(entities, "net_amount"));
  const tax = amountOf(pick(entities, "total_tax_amount"));
  const currency =
    textOf(pick(entities, "currency")) ??
    moneyCurrency(pick(entities, "total_amount")) ??
    "EUR";

  return {
    vendorName: textOf(pick(entities, "supplier_name")),
    vendorTaxId: textOf(pick(entities, "supplier_tax_id"))?.replace(/\s/g, "") ?? null,
    invoiceNumber: textOf(pick(entities, "invoice_id")),
    invoiceDate: dateOf(pick(entities, "invoice_date")),
    currency: currencyCode(currency),
    baseAmountCents: net,
    taxAmountCents: tax,
    totalAmountCents: total,
    taxRate: mapTaxRate(vatPercent(entities, net, tax)),
    isSimplified: false,
    expenseCategory: null,
    raw: { source: "document-ai", entities: summarize(entities) },
  };
}

function pick(entities: DocumentAiEntity[], type: string): DocumentAiEntity | null {
  let best: DocumentAiEntity | null = null;
  for (const entity of entities) {
    if (entity.type === type && (best === null || (entity.confidence ?? 0) > (best.confidence ?? 0))) {
      best = entity;
    }
  }
  return best;
}

function textOf(entity: DocumentAiEntity | null): string | null {
  const value = entity?.normalizedValue?.text ?? entity?.mentionText ?? null;
  if (value === null || value.trim() === "") {
    return null;
  }
  return value.replace(/\s+/g, " ").trim();
}

function amountOf(entity: DocumentAiEntity | null): bigint | null {
  if (entity === null) {
    return null;
  }
  const money = entity.normalizedValue?.moneyValue;
  if (money !== null && money !== undefined && (money.units !== null && money.units !== undefined || money.nanos)) {
    return moneyToCents(money);
  }
  const mention = entity.mentionText?.replace(/[^\d.,()+-]/g, "") ?? "";
  if (mention === "") {
    return null;
  }
  try {
    return parseBankAmount(mention);
  } catch {
    throw new ExtractionError(`Document AI returned an unreadable ${entity.type ?? "amount"}.`);
  }
}

/** Google Money is units plus nanos (1e-9). Rounds half away from zero to whole cents. */
export function moneyToCents(money: Money): bigint {
  const unitsText = money.units === null || money.units === undefined ? "0" : String(money.units);
  if (!/^-?\d+$/.test(unitsText)) {
    throw new ExtractionError("Document AI returned a non-integer money unit.");
  }
  const units = BigInt(unitsText);
  const nanos = BigInt(money.nanos ?? 0);
  const negative = units < 0n || nanos < 0n;
  const absNanos = nanos < 0n ? -nanos : nanos;
  const absUnits = units < 0n ? -units : units;
  const cents = absUnits * 100n + (absNanos + 5_000_000n) / 10_000_000n;
  return negative ? -cents : cents;
}

function moneyCurrency(entity: DocumentAiEntity | null): string | null {
  const code = entity?.normalizedValue?.moneyValue?.currencyCode;
  return code === null || code === undefined || code.trim() === "" ? null : code;
}

function currencyCode(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "€") return "EUR";
  if (trimmed === "$") return "USD";
  if (trimmed === "£") return "GBP";
  return trimmed.toUpperCase();
}

function dateOf(entity: DocumentAiEntity | null): Date | null {
  const date = entity?.normalizedValue?.dateValue;
  if (date?.year && date.month && date.day) {
    return new Date(Date.UTC(date.year, date.month - 1, date.day));
  }
  const text = entity?.normalizedValue?.text ?? null;
  const iso = text === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (iso !== null) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  return null;
}

/**
 * The Invoice Parser reports the rate as a `vat` entity with a `vat/tax_rate` property
 * ("21%", "21,00 %"). Without it, the rate is inferred only when net and tax agree
 * to the cent with one of the Spanish rates.
 */
function vatPercent(entities: DocumentAiEntity[], net: bigint | null, tax: bigint | null): string | null {
  for (const entity of entities) {
    const candidates =
      entity.type === "vat/tax_rate"
        ? [entity]
        : entity.type === "vat"
          ? (entity.properties ?? []).filter((property) => property.type === "vat/tax_rate")
          : [];
    for (const candidate of candidates) {
      const percent = percentOf(candidate.mentionText ?? candidate.normalizedValue?.text ?? null);
      if (percent !== null) {
        return percent;
      }
    }
  }
  if (net === null || tax === null || net <= 0n) {
    return null;
  }
  for (const rate of TAX_RATES) {
    const difference = net * rate - tax * 100n;
    if (difference >= -50n && difference <= 50n) {
      return rate.toString();
    }
  }
  return null;
}

function percentOf(value: string | null): string | null {
  const match = value === null ? null : /(\d{1,2})(?:[.,](\d{1,2}))?\s*%?/.exec(value);
  if (match === null || match[1] === undefined) {
    return null;
  }
  if (match[2] !== undefined && /[1-9]/.test(match[2])) {
    return null;
  }
  return String(Number(match[1]));
}

function summarize(entities: DocumentAiEntity[]): unknown[] {
  return entities.map((entity) => ({
    type: entity.type ?? null,
    mentionText: entity.mentionText ?? null,
    confidence: entity.confidence ?? null,
    normalized: entity.normalizedValue?.text ?? null,
    properties: entity.properties === null || entity.properties === undefined ? undefined : summarize(entity.properties),
  }));
}
