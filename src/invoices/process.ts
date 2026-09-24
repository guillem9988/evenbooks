import { InvoiceStatus, Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { reconcileOrganization } from "../matching/reconcile.js";
import { ExtractionError, extractInvoice, readLabeledText, type ExtractedInvoice } from "./extract.js";
import { recognizeImage, renderPdfPage } from "./ocr.js";
import { extractPdfText } from "./pdf-text.js";

export interface InvoiceObjectStore {
  get(key: string): Promise<Buffer>;
}

const TEXT_LAYER_MIN = 20;
const OCR_GAP = "Tesseract did not find a usable total, date, or vendor.";

export type ImageRecognizer = (bytes: Buffer) => Promise<string>;

export async function processInvoiceJob(
  prisma: PrismaClient,
  store: InvoiceObjectStore,
  invoiceId: string,
  apiKey: string | null,
  recognize: ImageRecognizer = recognizeImage,
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
    const extracted = hasText
      ? await extractInvoice({ text, image: null, apiKey })
      : await extractWithoutText(bytes, invoice.mimeType, isPdf, apiKey, recognize);
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

async function extractWithoutText(
  bytes: Buffer,
  mimeType: string,
  isPdf: boolean,
  apiKey: string | null,
  recognize: ImageRecognizer,
): Promise<ExtractedInvoice> {
  if (apiKey !== null) {
    return extractInvoice({
      text: null,
      image: { mediaType: mimeType, bytes },
      apiKey,
    });
  }
  const image = isPdf ? await renderPdfPage(bytes) : bytes;
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
      ocrRawResponse: JSON.parse(JSON.stringify(extracted.raw)) as Prisma.InputJsonValue,
    },
  });
}
