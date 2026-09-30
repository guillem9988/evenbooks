import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceStatus, TaxRateType, type PrismaClient } from "../../generated/prisma/client.js";
import { readExtractorConfig, type ExtractorConfig } from "../config.js";
import { fromDocumentAi, moneyToCents } from "./document-ai.js";
import { extractorChain, processInvoiceJob } from "./process.js";

const processDocument = vi.fn();

vi.mock("@google-cloud/documentai", () => ({
  DocumentProcessorServiceClient: class {
    processorPath(project: string, location: string, processor: string): string {
      return `projects/${project}/locations/${location}/processors/${processor}`;
    }
    processDocument = processDocument;
    async close(): Promise<void> {}
  },
}));

vi.mock("../matching/reconcile.js", () => ({
  reconcileOrganization: vi.fn(async () => undefined),
}));

const DOCUMENT_AI: ExtractorConfig = {
  mode: "auto",
  openaiApiKey: null,
  anthropicApiKey: null,
  deepseekApiKey: null,
  documentAi: {
    projectId: "matchinvoice-test",
    location: "eu",
    processorId: "abc123",
    credentials: { client_email: "docai@matchinvoice-test.iam.gserviceaccount.com", private_key: "test-key" },
  },
};

const INVOICE_121 = {
  entities: [
    { type: "supplier_name", mentionText: "Acme SL", confidence: 0.98 },
    { type: "supplier_tax_id", mentionText: "B 12345678", confidence: 0.95 },
    { type: "invoice_id", mentionText: "F2024-15", confidence: 0.97 },
    { type: "invoice_date", mentionText: "10/03/2026", normalizedValue: { text: "2026-03-10", dateValue: { year: 2026, month: 3, day: 10 } } },
    { type: "currency", mentionText: "€", normalizedValue: { text: "EUR" } },
    { type: "net_amount", mentionText: "100,00 €", normalizedValue: { moneyValue: { currencyCode: "EUR", units: "100", nanos: 0 } } },
    { type: "total_tax_amount", mentionText: "21,00 €", normalizedValue: { moneyValue: { currencyCode: "EUR", units: "21" } } },
    { type: "total_amount", mentionText: "121,00 €", normalizedValue: { moneyValue: { currencyCode: "EUR", units: "121", nanos: 0 } } },
    { type: "vat", mentionText: "IVA 21% 21,00", properties: [{ type: "vat/tax_rate", mentionText: "21%" }] },
  ],
};

interface Row {
  id: string;
  organizationId: string;
  storageKey: string;
  mimeType: string;
  status: InvoiceStatus;
  [field: string]: unknown;
}

function fakePrisma(rows: Row[]): PrismaClient {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    invoice: {
      findUnique: async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = byId.get(where.id);
        if (row === undefined) throw new Error("missing row");
        Object.assign(row, data);
        return row;
      },
    },
  } as unknown as PrismaClient;
}

const photo = (id: string): Row => ({
  id,
  organizationId: "org-1",
  storageKey: `invoices/${id}.jpg`,
  mimeType: "image/jpeg",
  status: InvoiceStatus.PROCESSING,
});

const store = { get: async (key: string) => Buffer.from(key) };

beforeEach(() => {
  processDocument.mockReset();
});

describe("Document AI extractor", () => {
  it("parses a 121,00 € invoice into integer cents and GENERAL_21", async () => {
    processDocument.mockResolvedValue([{ document: INVOICE_121 }]);
    const row = photo("docai-121");
    await processInvoiceJob(fakePrisma([row]), store, row.id, DOCUMENT_AI, async () => "");

    expect(processDocument).toHaveBeenCalledWith({
      name: "projects/matchinvoice-test/locations/eu/processors/abc123",
      rawDocument: { content: Buffer.from(row.storageKey).toString("base64"), mimeType: "image/jpeg" },
    });
    expect(row.status).toBe(InvoiceStatus.PARSED);
    expect(row.totalAmountCents).toBe(12100n);
    expect(row.baseAmountCents).toBe(10000n);
    expect(row.taxAmountCents).toBe(2100n);
    expect(row.taxRate).toBe(TaxRateType.GENERAL_21);
    expect(row.vendorName).toBe("Acme SL");
    expect(row.vendorTaxId).toBe("B12345678");
    expect(row.invoiceNumber).toBe("F2024-15");
    expect(row.currency).toBe("EUR");
    expect(row.invoiceDate).toEqual(new Date(Date.UTC(2026, 2, 10)));
  });

  it("falls back to the next provider when Document AI fails", async () => {
    processDocument.mockRejectedValue(new Error("7 PERMISSION_DENIED: billing disabled"));
    const readable = photo("docai-down");
    const recognize = async () =>
      ["vendor_name: Acme SL", "invoice_date: 2026-03-10", "total_amount: 121,00", "tax_rate_percent: 21"].join("\n");
    await processInvoiceJob(fakePrisma([readable]), store, readable.id, DOCUMENT_AI, recognize);

    expect(processDocument).toHaveBeenCalledTimes(1);
    expect(readable.status).toBe(InvoiceStatus.PARSED);
    expect(readable.totalAmountCents).toBe(12100n);
    expect(readable.taxRate).toBe(TaxRateType.GENERAL_21);
    expect(JSON.stringify(readable.ocrRawResponse)).toMatch(/Document AI: 7 PERMISSION_DENIED/);
  });

  it("marks an unreadable invoice FAILED and still parses the next one", async () => {
    processDocument
      .mockResolvedValueOnce([{ document: { entities: [{ type: "supplier_name", mentionText: "Blur SL" }] } }])
      .mockResolvedValueOnce([{ document: INVOICE_121 }]);
    const blurry = photo("docai-blurry");
    const next = photo("docai-next");
    const prisma = fakePrisma([blurry, next]);
    await processInvoiceJob(prisma, store, blurry.id, DOCUMENT_AI, async () => "no amounts here");
    await processInvoiceJob(prisma, store, next.id, DOCUMENT_AI, async () => "no amounts here");

    expect(blurry.status).toBe(InvoiceStatus.FAILED);
    expect(blurry.errorMessage).toMatch(/Document AI did not find total_amount/);
    expect(blurry.errorMessage).toMatch(/usable total, date, or vendor/);
    expect(next.status).toBe(InvoiceStatus.PARSED);
    expect(next.totalAmountCents).toBe(12100n);
  });

  it("infers the rate from net and tax when the vat entity is missing", () => {
    const entities = INVOICE_121.entities.filter((entity) => entity.type !== "vat");
    const extracted = fromDocumentAi({ entities });
    expect(extracted.taxRate).toBe(TaxRateType.GENERAL_21);
  });

  it("converts Google Money to cents without floats", () => {
    expect(moneyToCents({ units: "121", nanos: 0 })).toBe(12100n);
    expect(moneyToCents({ units: "65", nanos: 500_000_000 })).toBe(6550n);
    expect(moneyToCents({ units: "0", nanos: 994_999_999 })).toBe(99n);
    expect(moneyToCents({ units: "-3", nanos: -250_000_000 })).toBe(-325n);
    expect(moneyToCents({ units: "90071992547409930" })).toBe(9007199254740993000n);
  });
});

describe("extractor order", () => {
  const env = {
    GOOGLE_CLOUD_PROJECT_ID: "matchinvoice-test",
    DOCUMENT_AI_PROCESSOR_ID: "abc123",
    GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({ client_email: "a@b.iam.gserviceaccount.com", private_key: "k" }),
    OPENAI_API_KEY: "sk-test",
  };

  it("prefers Document AI, then OpenAI, then Anthropic, DeepSeek, and local parser in auto", () => {
    expect(extractorChain(readExtractorConfig(env))).toEqual(["document-ai", "openai", "local"]);
    expect(extractorChain(readExtractorConfig({ OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "sk-ant", DEEPSEEK_API_KEY: "sk-deep" }))).toEqual([
      "openai",
      "anthropic",
      "deepseek",
      "local",
    ]);
    expect(extractorChain(readExtractorConfig({ ANTHROPIC_API_KEY: "sk-ant" }))).toEqual(["anthropic", "local"]);
    expect(extractorChain(readExtractorConfig({ DEEPSEEK_API_KEY: "sk-deep" }))).toEqual(["deepseek", "local"]);
    expect(extractorChain(readExtractorConfig({}))).toEqual(["local"]);
  });

  it("starts where INVOICE_EXTRACTOR says and rejects missing credentials", () => {
    expect(extractorChain(readExtractorConfig({ ...env, INVOICE_EXTRACTOR: "openai" }))).toEqual(["openai", "local"]);
    expect(extractorChain(readExtractorConfig({ ...env, ANTHROPIC_API_KEY: "sk-ant", INVOICE_EXTRACTOR: "anthropic" }))).toEqual(["anthropic", "local"]);
    expect(extractorChain(readExtractorConfig({ ...env, DEEPSEEK_API_KEY: "sk-deep", INVOICE_EXTRACTOR: "deepseek" }))).toEqual(["deepseek", "local"]);
    expect(extractorChain(readExtractorConfig({ ...env, INVOICE_EXTRACTOR: "local" }))).toEqual(["local"]);
    expect(readExtractorConfig(env).documentAi?.location).toBe("eu");
    expect(() => readExtractorConfig({ INVOICE_EXTRACTOR: "documentai" })).toThrow(/GOOGLE_CLOUD_PROJECT_ID/);
    expect(() => readExtractorConfig({ INVOICE_EXTRACTOR: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => readExtractorConfig({ INVOICE_EXTRACTOR: "deepseek" })).toThrow(/DEEPSEEK_API_KEY/);
    expect(() => readExtractorConfig({ ...env, GOOGLE_APPLICATION_CREDENTIALS_JSON: "{not json" })).toThrow(/full service account key JSON/);
    expect(() => readExtractorConfig({ INVOICE_EXTRACTOR: "magic" })).toThrow(/INVOICE_EXTRACTOR/);
  });
});
