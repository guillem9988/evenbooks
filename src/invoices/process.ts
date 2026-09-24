import { InvoiceStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { reconcileOrganization } from "../matching/reconcile.js";
import { ExtractionError, extractInvoice, type ExtractedInvoice } from "./extract.js";
import { extractPdfText } from "./pdf-text.js";

export interface InvoiceObjectStore {
  get(key: string): Promise<Buffer>;
}

const TEXT_LAYER_MIN = 20;

export async function processInvoiceJob(
  prisma: PrismaClient,
  store: InvoiceObjectStore,
  invoiceId: string,
  apiKey: string | null,
): Promise<void> {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (invoice === null || invoice.status === InvoiceStatus.PARSED) {
      return;
    }
    const bytes = await store.get(invoice.storageKey);
    const isPdf = invoice.mimeType === "application/pdf";
    const text = isPdf ? await extractPdfText(bytes) : null;
    const hasText = text !== null && text.trim().length >= TEXT_LAYER_MIN;
    const extracted = await extractInvoice({
      text: hasText ? text : null,
      image: hasText ? null : { mediaType: invoice.mimeType, bytes },
      apiKey,
    });
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
      ocrRawResponse: JSON.parse(JSON.stringify(extracted.raw)) as Prisma.InputJsonValue,
    },
  });
}
