import JSZip from "jszip";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { formatCents } from "../lib/money.js";
import { renderIssuedInvoicePdf } from "../billing/invoice-pdf.js";

export interface ExportObjectStore {
  get(key: string): Promise<Buffer>;
}

export interface AccountantExport {
  body: Buffer;
  missingFiles: string[];
}

const CSV_HEADER = [
  "transaction_date",
  "amount_cents",
  "amount_eur",
  "currency",
  "raw_description",
  "match_status",
  "vendor_name",
  "invoice_number",
  "invoice_date",
  "base_amount_cents",
  "tax_amount_cents",
  "total_amount_cents",
  "tax_rate",
  "confidence_score",
];

export async function buildAccountantExport(
  prisma: PrismaClient,
  store: ExportObjectStore,
  organizationId: string,
  from: string,
  to: string,
): Promise<AccountantExport> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { legalName: true, taxId: true },
  });

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      organizationId,
      transactionDate: { gte: utcDate(from), lte: utcDate(to) },
    },
    include: {
      reconciliation: {
        include: {
          invoice: true,
          issuedInvoice: { include: { contact: true, lines: true } },
        },
      },
    },
    orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
  });

  const csvRows = [CSV_HEADER.join(",")];
  const anomalyLines: string[] = [];
  const missingFiles: string[] = [];
  const zip = new JSZip();

  for (const transaction of transactions) {
    const invoice = transaction.reconciliation?.invoice ?? null;
    const issued = transaction.reconciliation?.issuedInvoice ?? null;

    const vendorName = invoice?.vendorName ?? issued?.contact?.legalName ?? "";
    const invoiceNumber = invoice?.invoiceNumber ?? issued?.seriesNumber ?? "";
    const invoiceDate = invoice?.invoiceDate
      ? isoDate(invoice.invoiceDate)
      : issued?.invoiceDate
        ? isoDate(issued.invoiceDate)
        : "";
    const baseAmountCents = invoice?.baseAmountCents?.toString() ?? issued?.baseAmountCents?.toString() ?? "";
    const taxAmountCents = invoice?.taxAmountCents?.toString() ?? issued?.taxAmountCents?.toString() ?? "";
    const totalAmountCents = invoice?.totalAmountCents?.toString() ?? issued?.totalAmountCents?.toString() ?? "";
    const taxRate = invoice?.taxRate ?? (issued?.lines[0]?.taxRate ?? "");

    csvRows.push(
      [
        isoDate(transaction.transactionDate),
        transaction.amountCents.toString(),
        formatCents(transaction.amountCents),
        transaction.currency,
        safeText(transaction.rawDescription),
        transaction.matchStatus,
        safeText(vendorName),
        safeText(invoiceNumber),
        invoiceDate,
        baseAmountCents,
        taxAmountCents,
        totalAmountCents,
        taxRate,
        transaction.reconciliation ? transaction.reconciliation.confidenceScore.toFixed(4) : "",
      ]
        .map(csvCell)
        .join(","),
    );

    if (transaction.reconciliation === null) {
      const prefix = transaction.amountCents < 0n ? "" : "+";
      anomalyLines.push(
        `${isoDate(transaction.transactionDate)} ${prefix}${formatCents(transaction.amountCents)} ${transaction.currency} ${transaction.rawDescription}`,
      );
    }

    if (invoice && invoice.storageKey) {
      const filename = invoiceFilename(invoice, transaction.transactionDate);
      try {
        const bytes = await store.get(invoice.storageKey);
        zip.file(`factures/${filename}`, bytes);
      } catch {
        missingFiles.push(`${filename} missing from bucket (${invoice.storageKey})`);
      }
    }

    if (issued && organization) {
      try {
        const pdfBytes = await renderIssuedInvoicePdf({
          legalName: organization.legalName,
          taxId: organization.taxId,
          contactName: issued.contact.legalName,
          contactTaxId: issued.contact.taxId,
          seriesNumber: issued.seriesNumber,
          invoiceDate: isoDate(issued.invoiceDate),
          baseAmountCents: issued.baseAmountCents,
          taxAmountCents: issued.taxAmountCents,
          totalAmountCents: issued.totalAmountCents,
          lines: issued.lines,
        });
        const filename = `${sanitizeVendor(issued.seriesNumber)}.pdf`;
        zip.file(`factures_emeses/${filename}`, Buffer.from(pdfBytes));
      } catch {
        // Continue if PDF render fails
      }
    }
  }

  if (missingFiles.length > 0) {
    anomalyLines.push("", "Missing invoice files:", ...missingFiles);
  }

  zip.file("resum_trimestral.csv", `${csvRows.join("\n")}\n`);
  zip.file(
    "anomalies_sense_justificant.txt",
    anomalyLines.length === 0 ? "" : `${anomalyLines.join("\n")}\n`,
  );
  const body = await zip.generateAsync({ type: "nodebuffer" });
  return { body, missingFiles };
}

export function parseExportRange(from: string | undefined, to: string | undefined): { from: string; to: string } | string {
  if (from === undefined || to === undefined || !isIsoDate(from) || !isIsoDate(to)) {
    return "from and to must be dates in YYYY-MM-DD form";
  }
  if (from > to) {
    return "from must be on or before to";
  }
  return { from, to };
}

function invoiceFilename(
  invoice: {
    id: string;
    vendorName: string | null;
    invoiceDate: Date | null;
    totalAmountCents: bigint | null;
    originalFilename: string;
  },
  transactionDate: Date,
): string {
  const day = (invoice.invoiceDate ?? transactionDate).toISOString().slice(0, 10).replaceAll("-", "");
  const vendor = sanitizeVendor(invoice.vendorName ?? "unknown");
  const total = formatCents(invoice.totalAmountCents ?? 0n);
  const extension = extensionOf(invoice.originalFilename);
  return `${day}_${vendor}_${total}_${invoice.id}${extension}`;
}

function sanitizeVendor(vendor: string): string {
  const cleaned = vendor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return cleaned.length === 0 ? "unknown" : cleaned;
}

function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename);
  return match === null ? "" : `.${match[1]?.toLowerCase()}`;
}

/**
 * Text that came from bank files or scanned invoices must not run as a spreadsheet formula when the
 * accountant opens the CSV (=HYPERLINK(...), +cmd, @SUM...). A leading apostrophe keeps it as text.
 */
export function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }
  const date = utcDate(value);
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]);
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
