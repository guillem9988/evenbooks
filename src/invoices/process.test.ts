import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, describe, expect, it } from "vitest";
import { InvoiceStatus, TaxRateType } from "../../generated/prisma/client.js";
import { loadConfig } from "../config.js";
import { createDatabase } from "../lib/prisma.js";
import { processInvoiceJob } from "./process.js";

const database = createDatabase(loadConfig().databaseUrl);
const objects = new Map<string, Buffer>();
const store = {
  async get(key: string): Promise<Buffer> {
    const body = objects.get(key);
    if (body === undefined) {
      throw new Error(`missing ${key}`);
    }
    return body;
  },
};

afterAll(async () => {
  await database.close();
});

const LABELED = [
  "vendor_name: Acme SL",
  "vendor_tax_id: B12345678",
  "invoice_number: F2024-15",
  "invoice_date: 2026-03-10",
  "currency: EUR",
  "base_amount: 100.00",
  "tax_amount: 21.00",
  "total_amount: 121.00",
  "tax_rate_percent: 21",
  "is_simplified_receipt: false",
].join("\n");

describe("processInvoiceJob", () => {
  it("parses a text PDF into cents, marks an unreadable image failed, and still processes the next file", async () => {
    const organization = await database.prisma.organization.create({
      data: { legalName: "Invoice Worker SL", taxId: "B00000003" },
    });
    const textInvoice = await seed(organization.id, "application/pdf", await textPdf(LABELED));
    const blurry = await seed(organization.id, "image/jpeg", Buffer.from("not-a-real-photo"));
    const second = await seed(organization.id, "application/pdf", await textPdf(LABELED.replace("F2024-15", "F2024-16")));

    const unreadable = async () => "page with no invoice fields";
    await processInvoiceJob(database.prisma, store, blurry, null, unreadable);
    await processInvoiceJob(database.prisma, store, textInvoice, null, unreadable);
    await processInvoiceJob(database.prisma, store, second, null, unreadable);

    const failed = await database.prisma.invoice.findUniqueOrThrow({ where: { id: blurry } });
    const parsed = await database.prisma.invoice.findUniqueOrThrow({ where: { id: textInvoice } });
    const parsedToo = await database.prisma.invoice.findUniqueOrThrow({ where: { id: second } });

    expect(failed.status).toBe(InvoiceStatus.FAILED);
    expect(failed.errorMessage).toMatch(/usable total, date, or vendor/);
    expect(parsed.status).toBe(InvoiceStatus.PARSED);
    expect(parsed.totalAmountCents).toBe(12100n);
    expect(parsed.baseAmountCents).toBe(10000n);
    expect(parsed.taxAmountCents).toBe(2100n);
    expect(parsed.taxRate).toBe(TaxRateType.GENERAL_21);
    expect(parsed.vendorName).toBe("Acme SL");
    expect(parsedToo.status).toBe(InvoiceStatus.PARSED);
    expect(parsedToo.invoiceNumber).toBe("F2024-16");

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });

  it("parses a Tesseract reading of 121.00 EUR and still parses the next text PDF after a blank page", async () => {
    const organization = await database.prisma.organization.create({
      data: { legalName: "OCR Fallback SL", taxId: "B00000008" },
    });
    const seen = new Set<string>();
    const recognize = async (bytes: Buffer) => {
      seen.add(bytes.toString("utf8"));
      return bytes.toString("utf8") === "invoice-121" ? LABELED : "no amounts on this page";
    };
    const readable = await seed(organization.id, "image/png", Buffer.from("invoice-121"));
    const blank = await seed(organization.id, "image/png", Buffer.from("blank-scan"));
    const followUp = await seed(organization.id, "application/pdf", await textPdf(LABELED.replace("F2024-15", "F2024-17")));

    await processInvoiceJob(database.prisma, store, readable, null, recognize);
    await processInvoiceJob(database.prisma, store, blank, null, recognize);
    await processInvoiceJob(database.prisma, store, followUp, null, recognize);

    const parsed = await database.prisma.invoice.findUniqueOrThrow({ where: { id: readable } });
    const failed = await database.prisma.invoice.findUniqueOrThrow({ where: { id: blank } });
    const next = await database.prisma.invoice.findUniqueOrThrow({ where: { id: followUp } });
    expect(parsed.status).toBe(InvoiceStatus.PARSED);
    expect(parsed.totalAmountCents).toBe(12100n);
    expect(parsed.currency).toBe("EUR");
    expect(failed.status).toBe(InvoiceStatus.FAILED);
    expect(failed.errorMessage).toMatch(/usable total, date, or vendor/);
    expect(next.status).toBe(InvoiceStatus.PARSED);
    expect(next.invoiceNumber).toBe("F2024-17");
    expect(seen.has("invoice-121")).toBe(true);
    expect(seen.size).toBe(2);

    await database.prisma.organization.delete({ where: { id: organization.id } });
  });
});

async function seed(organizationId: string, mimeType: string, bytes: Buffer): Promise<string> {
  const invoice = await database.prisma.invoice.create({
    data: {
      organizationId,
      storageKey: `invoices/${organizationId}/${mimeType}-${bytes.length}-${Math.random()}`,
      originalFilename: "invoice.bin",
      mimeType,
      fileSizeBytes: bytes.length,
      status: InvoiceStatus.PROCESSING,
    },
  });
  objects.set(invoice.storageKey, bytes);
  return invoice.id;
}

async function textPdf(text: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage();
  const font = await document.embedFont(StandardFonts.Helvetica);
  text.split("\n").forEach((line, index) => {
    page.drawText(line, { x: 40, y: 780 - index * 18, size: 12, font });
  });
  return Buffer.from(await document.save());
}
