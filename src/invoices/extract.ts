import OpenAI from "openai";
import { TaxRateType } from "../../generated/prisma/client.js";
import { parseBankAmount } from "../statements/parse-csv.js";

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export interface ExtractedInvoice {
  vendorName: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  currency: string | null;
  baseAmountCents: bigint | null;
  taxAmountCents: bigint | null;
  totalAmountCents: bigint;
  taxRate: TaxRateType;
  isSimplified: boolean;
  raw: unknown;
}

const TEXT_FIELDS = [
  "vendor_name",
  "vendor_tax_id",
  "invoice_number",
  "invoice_date",
  "currency",
  "base_amount",
  "tax_amount",
  "total_amount",
  "tax_rate_percent",
  "is_simplified_receipt",
] as const;

const INVOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...TEXT_FIELDS],
  properties: {
    vendor_name: { type: ["string", "null"] },
    vendor_tax_id: { type: ["string", "null"] },
    invoice_number: { type: ["string", "null"] },
    invoice_date: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    base_amount: { type: ["string", "null"] },
    tax_amount: { type: ["string", "null"] },
    total_amount: { type: ["string", "null"] },
    tax_rate_percent: { type: ["integer", "null"] },
    is_simplified_receipt: { type: "boolean" },
  },
} as const;

export async function extractInvoice(input: {
  text: string | null;
  image: { mediaType: string; bytes: Buffer } | null;
  apiKey: string | null;
}): Promise<ExtractedInvoice> {
  if (input.text !== null && input.text.trim().length >= 20) {
    if (input.apiKey === null) {
      return fromFields(readLabeledText(input.text), { source: "local-text" });
    }
    return fromFields(await openAiExtract(input.apiKey, { text: input.text }), { source: "openai-text" });
  }

  if (input.apiKey === null) {
    throw new ExtractionError(
      "OPENAI_API_KEY is not set, and this file has no embedded text to extract. Image and scanned PDF invoices need the vision model.",
    );
  }
  if (input.image === null) {
    throw new ExtractionError("Scanned PDF has no embedded text and no page image for the vision model.");
  }
  return fromFields(
    await openAiExtract(input.apiKey, { image: input.image }),
    { source: "openai-vision" },
  );
}

export function readLabeledText(text: string): Record<string, string | null> {
  const fields: Record<string, string | null> = {};
  for (const name of TEXT_FIELDS) {
    const match = new RegExp(`(?:^|\\n)\\s*${name}\\s*[:=]\\s*(.+)$`, "im").exec(text);
    fields[name] = match?.[1]?.trim() ?? null;
  }
  return fields;
}

function fromFields(fields: Record<string, string | null>, raw: unknown): ExtractedInvoice {
  const total = fields.total_amount ?? null;
  if (total === null || total.trim() === "") {
    throw new ExtractionError("Extraction did not include total_amount. Totals are never guessed.");
  }
  return {
    vendorName: emptyToNull(fields.vendor_name ?? null),
    vendorTaxId: emptyToNull(fields.vendor_tax_id ?? null),
    invoiceNumber: emptyToNull(fields.invoice_number ?? null),
    invoiceDate: parseInvoiceDate(fields.invoice_date ?? null),
    currency: (emptyToNull(fields.currency ?? null) ?? "EUR").toUpperCase(),
    baseAmountCents: optionalCents(fields.base_amount ?? null),
    taxAmountCents: optionalCents(fields.tax_amount ?? null),
    totalAmountCents: parseBankAmount(total),
    taxRate: mapTaxRate(fields.tax_rate_percent ?? null),
    isSimplified: /^(1|true|yes|si|sí)$/i.test(fields.is_simplified_receipt ?? ""),
    raw,
  };
}

async function openAiExtract(
  apiKey: string,
  source: { text: string } | { image: { mediaType: string; bytes: Buffer } },
  model = "gpt-4o",
): Promise<Record<string, string | null>> {
  const client = new OpenAI({ apiKey });
  const content =
    "text" in source
      ? [{ type: "text" as const, text: source.text }]
      : [
          { type: "text" as const, text: "Extract the invoice fields. Use null when a field is not visible. Amounts are decimal strings, not floats you compute." },
          {
            type: "image_url" as const,
            image_url: {
              url: `data:${source.image.mediaType};base64,${source.image.bytes.toString("base64")}`,
            },
          },
        ];

  const completion = await client.chat.completions.create({
    model: model || "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "Extract invoice fields into the schema. Do not invent amounts. If the total is unreadable, return null for total_amount.",
      },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "invoice", strict: true, schema: INVOICE_SCHEMA },
    },
  });
  const payload = completion.choices[0]?.message.content;
  if (payload === null || payload === undefined || payload.trim() === "") {
    throw new ExtractionError("OpenAI returned an empty invoice payload.");
  }
  const parsed = JSON.parse(payload) as Record<string, string | number | boolean | null>;
  return normalizeExtractedMap(parsed);
}

function normalizeExtractedMap(parsed: Record<string, unknown>): Record<string, string | null> {
  return {
    vendor_name: asString(parsed.vendor_name),
    vendor_tax_id: asString(parsed.vendor_tax_id),
    invoice_number: asString(parsed.invoice_number),
    invoice_date: asString(parsed.invoice_date),
    currency: asString(parsed.currency),
    base_amount: asString(parsed.base_amount),
    tax_amount: asString(parsed.tax_amount),
    total_amount: asString(parsed.total_amount),
    tax_rate_percent:
      parsed.tax_rate_percent === null || parsed.tax_rate_percent === undefined
        ? null
        : String(parsed.tax_rate_percent),
    is_simplified_receipt:
      parsed.is_simplified_receipt === true || parsed.is_simplified_receipt === "true" ? "true" : "false",
  };
}

async function anthropicExtract(
  apiKey: string,
  source: { text: string } | { image: { mediaType: string; bytes: Buffer } },
  model = "claude-3-7-sonnet-latest",
): Promise<Record<string, string | null>> {
  const content =
    "text" in source
      ? [{ type: "text" as const, text: `Extract all invoice fields strictly formatted as JSON from this text:\n\n${source.text}` }]
      : [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: (source.image.mediaType === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
              data: source.image.bytes.toString("base64"),
            },
          },
          {
            type: "text" as const,
            text: "Extract all invoice fields strictly into the requested JSON schema from this invoice image.",
          },
        ];

  const targetModel = model?.trim() || "claude-3-7-sonnet-latest";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: targetModel,
      max_tokens: 1024,
      system:
        "You are an expert invoice extraction tool. Extract invoice fields and respond ONLY with a raw JSON object with keys: vendor_name, vendor_tax_id, invoice_number, invoice_date (YYYY-MM-DD), currency, base_amount, tax_amount, total_amount, tax_rate_percent, is_simplified_receipt. Use null for missing fields. Do not include markdown codeblocks or explanation.",
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new ExtractionError(`Anthropic API error (${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const rawText = data.content?.[0]?.text ?? "";
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return normalizeExtractedMap(parsed);
}

async function deepseekExtract(
  apiKey: string,
  source: { text: string },
  model = "deepseek-chat",
): Promise<Record<string, string | null>> {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });

  const completion = await client.chat.completions.create({
    model: model || "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "You are an expert invoice extraction tool. Extract invoice fields and respond ONLY with a valid JSON object with keys: vendor_name, vendor_tax_id, invoice_number, invoice_date (YYYY-MM-DD), currency, base_amount, tax_amount, total_amount, tax_rate_percent, is_simplified_receipt. Use null for missing or unknown fields. Do not guess totals.",
      },
      { role: "user", content: `Extract invoice fields from this text:\n\n${source.text}` },
    ],
    response_format: { type: "json_object" },
  });

  const payload = completion.choices[0]?.message.content;
  if (!payload || payload.trim() === "") {
    throw new ExtractionError("DeepSeek returned an empty invoice payload.");
  }
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  return normalizeExtractedMap(parsed);
}

async function geminiExtract(
  apiKey: string,
  source: { text: string } | { inline: { mimeType: string; bytes: Buffer } },
  model = "gemini-2.5-flash",
): Promise<Record<string, string | null>> {
  const parts: unknown[] = [];
  if ("text" in source) {
    parts.push({ text: `Extract invoice fields from this text:\n\n${source.text}` });
  } else {
    parts.push({
      inline_data: {
        mime_type: source.inline.mimeType,
        data: source.inline.bytes.toString("base64"),
      },
    });
    parts.push({
      text: "Extract all invoice fields strictly into the requested JSON structure from this document.",
    });
  }

  const targetModel = model?.trim() || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: "You are an expert invoice extraction AI. Extract invoice fields and return ONLY a valid JSON object with keys: vendor_name, vendor_tax_id, invoice_number, invoice_date (YYYY-MM-DD), currency, base_amount, tax_amount, total_amount, tax_rate_percent (integer: 21, 10, 4, 0 or null), is_simplified_receipt (boolean). Never invent amounts. If unreadable, return null.",
            },
          ],
        },
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const errorBody = await res.text();
    throw new ExtractionError(`Google Gemini API error (${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  if (!cleaned) {
    throw new ExtractionError("Google Gemini returned an empty invoice payload.");
  }
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return normalizeExtractedMap(parsed);
}

export async function extractInvoiceWithGemini(input: {
  text: string | null;
  file: { mimeType: string; bytes: Buffer } | null;
  apiKey: string;
  model?: string | null;
}): Promise<ExtractedInvoice> {
  const model = input.model?.trim() || "gemini-2.5-flash";
  if (input.file !== null) {
    return fromFields(await geminiExtract(input.apiKey, { inline: input.file }, model), {
      source: "gemini-multimodal",
      model,
    });
  }
  if (input.text !== null && input.text.trim().length >= 20) {
    return fromFields(await geminiExtract(input.apiKey, { text: input.text }, model), {
      source: "gemini-text",
      model,
    });
  }
  throw new ExtractionError("No file or text available for Gemini extraction.");
}

export async function extractInvoiceWithAnthropic(input: {
  text: string | null;
  image: { mediaType: string; bytes: Buffer } | null;
  apiKey: string;
  model?: string | null;
}): Promise<ExtractedInvoice> {
  const model = input.model?.trim() || "claude-3-7-sonnet-latest";
  if (input.text !== null && input.text.trim().length >= 20) {
    return fromFields(await anthropicExtract(input.apiKey, { text: input.text }, model), { source: "anthropic-text", model });
  }
  if (input.image === null) {
    throw new ExtractionError("File has no text and no page image for Anthropic vision.");
  }
  return fromFields(await anthropicExtract(input.apiKey, { image: input.image }, model), { source: "anthropic-vision", model });
}

export async function extractInvoiceWithDeepseek(input: {
  text: string;
  apiKey: string;
  model?: string | null;
}): Promise<ExtractedInvoice> {
  const model = input.model?.trim() || "deepseek-chat";
  return fromFields(await deepseekExtract(input.apiKey, { text: input.text }, model), { source: "deepseek-text", model });
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function emptyToNull(value: string | null): string | null {
  if (value === null || value.trim() === "" || value.toLowerCase() === "null") {
    return null;
  }
  return value.trim();
}

function optionalCents(value: string | null): bigint | null {
  if (value === null || value.trim() === "" || value.toLowerCase() === "null") {
    return null;
  }
  return parseBankAmount(value);
}

function parseInvoiceDate(value: string | null): Date | null {
  if (value === null || value.trim() === "" || value.toLowerCase() === "null") {
    return null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso !== null) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value.trim());
  if (dmy !== null) {
    return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  }
  return null;
}

export function mapTaxRate(value: string | null): TaxRateType {
  const percent = value === null ? null : Number(value.trim());
  if (percent === 21) return TaxRateType.GENERAL_21;
  if (percent === 10) return TaxRateType.REDUCED_10;
  if (percent === 4) return TaxRateType.SUPER_REDUCED_4;
  if (percent === 0) return TaxRateType.EXEMPT_0;
  return TaxRateType.UNKNOWN;
}
