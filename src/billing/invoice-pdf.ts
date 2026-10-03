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
  rectifiesSeriesNumber?: string | null;
  documentTitle?: string;
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
  const page = pdf.addPage([595.28, 841.89]);
  const width = page.getWidth();
  const height = page.getHeight();

  const margin = 48;
  const contentWidth = width - margin * 2;
  let y = height - 52;

  const title = input.documentTitle
    ? input.documentTitle
    : input.rectifiesSeriesNumber
      ? "FACTURA RECTIFICATIVA"
      : "FACTURA";

  // Top accent bar
  page.drawRectangle({
    x: 0,
    y: height - 6,
    width,
    height: 6,
    color: rgb(0.18, 0.35, 0.75),
  });

  // Top Header: Issuer on left, Document Title & Number on right
  page.drawText(sanitize(input.legalName, 40), {
    x: margin,
    y,
    size: 16,
    font,
    color: rgb(0.08, 0.12, 0.22),
  });

  const titleWidth = font.widthOfTextAtSize(title, 20);
  page.drawText(title, {
    x: width - margin - titleWidth,
    y,
    size: 20,
    font,
    color: rgb(0.18, 0.35, 0.75),
  });

  y -= 18;
  page.drawText(`NIF: ${sanitize(input.taxId, 25)}`, {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.4, 0.45, 0.52),
  });

  const numText = `Núm: ${sanitize(input.seriesNumber, 30)}`;
  const numWidth = font.widthOfTextAtSize(numText, 11);
  page.drawText(numText, {
    x: width - margin - numWidth,
    y,
    size: 11,
    font,
    color: rgb(0.1, 0.15, 0.25),
  });

  y -= 15;
  const dateFormatted = input.invoiceDate.split("-").reverse().join("/");
  const dateText = `Data: ${dateFormatted}`;
  const dateWidth = font.widthOfTextAtSize(dateText, 10);
  page.drawText(dateText, {
    x: width - margin - dateWidth,
    y,
    size: 10,
    font,
    color: rgb(0.4, 0.45, 0.52),
  });

  if (input.rectifiesSeriesNumber) {
    y -= 14;
    const rectText = `Corregeix la factura: ${sanitize(input.rectifiesSeriesNumber, 30)}`;
    const rectWidth = font.widthOfTextAtSize(rectText, 9.5);
    page.drawText(rectText, {
      x: width - margin - rectWidth,
      y,
      size: 9.5,
      font,
      color: rgb(0.75, 0.2, 0.2),
    });
  }

  y -= 25;

  // Thin separator line
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.88, 0.9, 0.94),
  });

  y -= 20;

  // Client Details Box
  page.drawRectangle({
    x: margin,
    y: y - 52,
    width: contentWidth,
    height: 56,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.9, 0.92, 0.95),
    borderWidth: 1,
  });

  page.drawText("DADES DEL CLIENT", {
    x: margin + 14,
    y: y - 4,
    size: 8.5,
    font,
    color: rgb(0.5, 0.55, 0.62),
  });

  page.drawText(sanitize(input.contactName, 50), {
    x: margin + 14,
    y: y - 20,
    size: 11.5,
    font,
    color: rgb(0.1, 0.12, 0.18),
  });

  page.drawText(`NIF: ${sanitize(input.contactTaxId, 25)}`, {
    x: margin + 14,
    y: y - 36,
    size: 9.5,
    font,
    color: rgb(0.4, 0.45, 0.52),
  });

  y -= 75;

  // Table header background
  page.drawRectangle({
    x: margin,
    y: y - 6,
    width: contentWidth,
    height: 22,
    color: rgb(0.93, 0.95, 0.98),
  });

  const colDesc = margin + 8;
  const colQttRight = margin + 275;
  const colUnitRight = margin + 355;
  const colTaxRight = margin + 415;
  const colTotalRight = width - margin - 8;

  const headerY = y;
  page.drawText("DESCRIPCIÓ", { x: colDesc, y: headerY, size: 9, font, color: rgb(0.3, 0.35, 0.42) });
  drawRight("UNITATS", colQttRight, headerY, 9, rgb(0.3, 0.35, 0.42));
  drawRight("PREU UNITARI", colUnitRight, headerY, 9, rgb(0.3, 0.35, 0.42));
  drawRight("IVA", colTaxRight, headerY, 9, rgb(0.3, 0.35, 0.42));
  drawRight("TOTAL", colTotalRight, headerY, 9, rgb(0.3, 0.35, 0.42));

  y -= 18;

  // Table Lines
  for (const [i, line] of input.lines.entries()) {
    const rate = enumToRate(line.taxRate) ?? 0;

    if (i % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: y - 5,
        width: contentWidth,
        height: 20,
        color: rgb(0.98, 0.99, 1.0),
      });
    }

    page.drawText(sanitize(line.description, 45), {
      x: colDesc,
      y,
      size: 9.5,
      font,
      color: rgb(0.15, 0.18, 0.24),
    });
    drawRight(String(line.quantity), colQttRight, y, 9.5, rgb(0.15, 0.18, 0.24));
    drawRight(formatEuroDisplay(line.unitAmountCents), colUnitRight, y, 9.5, rgb(0.15, 0.18, 0.24));
    drawRight(`${rate}%`, colTaxRight, y, 9.5, rgb(0.4, 0.45, 0.52));
    drawRight(formatEuroDisplay(line.totalAmountCents), colTotalRight, y, 9.5, rgb(0.08, 0.12, 0.2));

    y -= 18;

    page.drawLine({
      start: { x: margin, y: y + 4 },
      end: { x: width - margin, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.92, 0.94, 0.96),
    });
  }

  y -= 25;

  // Totals Section on bottom right
  const totalsWidth = 210;
  const totalsX = width - margin - totalsWidth;

  page.drawText("Base Imposable:", { x: totalsX, y, size: 10, font, color: rgb(0.35, 0.4, 0.48) });
  drawRight(formatEuroDisplay(input.baseAmountCents), colTotalRight, y, 10, rgb(0.15, 0.18, 0.24));

  y -= 16;
  page.drawText("Quota IVA:", { x: totalsX, y, size: 10, font, color: rgb(0.35, 0.4, 0.48) });
  drawRight(formatEuroDisplay(input.taxAmountCents), colTotalRight, y, 10, rgb(0.15, 0.18, 0.24));

  y -= 22;

  // Total Box
  page.drawRectangle({
    x: totalsX - 8,
    y: y - 6,
    width: totalsWidth + 8,
    height: 28,
    color: rgb(0.94, 0.96, 1.0),
    borderColor: rgb(0.82, 0.88, 0.98),
    borderWidth: 1,
  });

  page.drawText("TOTAL:", {
    x: totalsX,
    y: y + 2,
    size: 12,
    font,
    color: rgb(0.1, 0.2, 0.5),
  });

  drawRight(formatEuroDisplay(input.totalAmountCents), colTotalRight, y + 2, 12, rgb(0.1, 0.2, 0.5));

  // Footer note
  page.drawText("Gràcies per la vostra confiança.", {
    x: margin,
    y: 36,
    size: 9,
    font,
    color: rgb(0.55, 0.6, 0.68),
  });

  function drawRight(text: string, rightX: number, textY: number, size: number, color: ReturnType<typeof rgb>) {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: rightX - textWidth,
      y: textY,
      size,
      font,
      color,
    });
  }

  return pdf.save();
}

export function renderQuotePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  return renderIssuedInvoicePdf({
    ...input,
    documentTitle: "PRESSUPOST",
  });
}

function sanitize(value: string, maxLen = 80): string {
  return value.replace(/\s+/g, " ").slice(0, maxLen);
}
