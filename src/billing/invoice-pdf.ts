import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import type { TaxRateType } from "../../generated/prisma/client.js";
import { formatEuroDisplay } from "../lib/money.js";
import { enumToRate } from "./lines.js";

export interface InvoicePdfInput {
  legalName: string;
  taxId: string;
  contactName: string;
  contactTaxId: string;
  seriesNumber: string;
  invoiceDate: string;
  rectifiesSeriesNumber: string | null;
  baseAmountCents: bigint;
  taxAmountCents: bigint;
  totalAmountCents: bigint;
  lines: Array<{
    description: string;
    quantity: number;
    unitAmountCents: bigint;
    taxRate: TaxRateType;
    totalAmountCents: bigint;
  }>;
}

export async function renderIssuedInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await readFile(fileURLToPath(new URL("./fonts/LiberationSans-Regular.ttf", import.meta.url)));
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const page = pdf.addPage([595, 842]);
  let y = 790;
  const draw = (text: string, size = 11) => {
    page.drawText(sanitize(text), { x: 48, y, size, font, color: rgb(0.12, 0.14, 0.16) });
    y -= size + 8;
  };

  if (input.rectifiesSeriesNumber) {
    draw("FACTURA RECTIFICATIVA", 18);
    draw(`Corregeix la factura ${input.rectifiesSeriesNumber}`);
  } else {
    draw("FACTURA", 18);
  }
  y -= 6;
  draw(input.legalName, 14);
  draw(`NIF: ${input.taxId}`);
  y -= 8;
  draw("Client", 12);
  draw(input.contactName);
  draw(`NIF: ${input.contactTaxId}`);
  y -= 8;
  draw(`Número: ${input.seriesNumber}`);
  draw(`Data: ${input.invoiceDate.split("-").reverse().join("/")}`);
  y -= 10;
  draw("Línies", 12);
  for (const line of input.lines) {
    const rate = enumToRate(line.taxRate) ?? 0;
    draw(
      `${line.quantity} × ${line.description} · ${formatEuroDisplay(line.unitAmountCents)} · IVA ${rate}% · ${formatEuroDisplay(line.totalAmountCents)}`,
    );
  }
  y -= 8;
  draw(`Base: ${formatEuroDisplay(input.baseAmountCents)}`);
  draw(`IVA: ${formatEuroDisplay(input.taxAmountCents)}`);
  draw(`Total: ${formatEuroDisplay(input.totalAmountCents)}`, 13);
  return pdf.save();
}

function sanitize(value: string): string {
  return value.replace(/\s+/g, " ").slice(0, 110);
}
