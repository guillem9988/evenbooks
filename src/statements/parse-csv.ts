export class CsvStatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvStatementError";
  }
}

export interface ParsedBankTransaction {
  transactionDate: Date;
  valueDate: Date;
  amountCents: bigint;
  rawDescription: string;
}

const DATE_HEADERS = new Set([
  "date",
  "fecha",
  "transactiondate",
  "fechaoperacion",
  "fechamovimiento",
]);
const VALUE_DATE_HEADERS = new Set(["valuedate", "fechavalor"]);
const DESCRIPTION_HEADERS = new Set([
  "description",
  "concepto",
  "concept",
  "descripcion",
  "movimiento",
  "rawdescription",
]);
const AMOUNT_HEADERS = new Set(["amount", "importe", "cantidad"]);
const DEBIT_HEADERS = new Set(["debit", "debe", "cargo"]);
const CREDIT_HEADERS = new Set(["credit", "haber", "abono"]);

export function parseBankCsv(content: string): ParsedBankTransaction[] {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (text.length === 0) {
    throw new CsvStatementError("CSV file is empty");
  }

  const delimiter = detectDelimiter(text);
  const rows = parseRows(text, delimiter).filter((row) => row.some((cell) => cell.trim() !== ""));
  const header = rows[0];
  if (header === undefined || rows.length < 2) {
    throw new CsvStatementError("CSV must include a header and at least one transaction");
  }

  const columns = mapColumns(header);
  return rows.slice(1).map((row, index) => parseRow(row, columns, index + 2));
}

export function cleanDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Euro amount to signed cents. Accepts `-121,00`, `121.00`, and `1.234,56`. No floats. */
export function parseBankAmount(raw: string): bigint {
  let value = raw.trim().replace(/\s/g, "").replace(/€/g, "");
  if (value.length === 0) {
    throw new CsvStatementError("Amount is empty");
  }

  let negative = false;
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.startsWith("-")) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  if (!/^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?$|^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    throw new CsvStatementError(`Invalid amount "${raw}"`);
  }

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  let whole = value;
  let fraction = "";
  if (decimalIndex !== -1) {
    const separator = value[decimalIndex];
    if (separator !== "." && separator !== ",") {
      throw new CsvStatementError(`Invalid amount "${raw}"`);
    }
    const after = value.length - decimalIndex - 1;
    const thousands = separator === "." ? "," : ".";
    if (after === 3 && !value.slice(0, decimalIndex).includes(thousands)) {
      whole = value.replaceAll(separator, "");
    } else {
      whole = value.slice(0, decimalIndex).replaceAll(thousands, "").replaceAll(separator, "");
      fraction = value.slice(decimalIndex + 1);
    }
  }
  if (!/^\d+$/.test(whole) || (fraction !== "" && !/^\d{1,2}$/.test(fraction))) {
    throw new CsvStatementError(`Invalid amount "${raw}"`);
  }
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

interface ColumnMap {
  date: number;
  valueDate: number | null;
  description: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
}

function mapColumns(header: string[]): ColumnMap {
  const indexes = new Map<string, number>();
  header.forEach((cell, index) => {
    indexes.set(headerKey(cell), index);
  });

  const date = findHeader(indexes, DATE_HEADERS);
  const description = findHeader(indexes, DESCRIPTION_HEADERS);
  const amount = findHeader(indexes, AMOUNT_HEADERS);
  const debit = findHeader(indexes, DEBIT_HEADERS);
  const credit = findHeader(indexes, CREDIT_HEADERS);
  if (date === null || description === null || (amount === null && debit === null && credit === null)) {
    throw new CsvStatementError(
      "CSV header must include a date, a description, and an amount or debit/credit columns",
    );
  }
  return {
    date,
    valueDate: findHeader(indexes, VALUE_DATE_HEADERS),
    description,
    amount,
    debit,
    credit,
  };
}

function parseRow(row: string[], columns: ColumnMap, line: number): ParsedBankTransaction {
  const transactionDate = parseDate(cell(row, columns.date), line);
  const valueDate =
    columns.valueDate === null ? transactionDate : parseDate(cell(row, columns.valueDate), line);
  const rawDescription = cleanDescription(cell(row, columns.description));
  if (rawDescription.length === 0) {
    throw new CsvStatementError(`Line ${line} is missing a description`);
  }
  return {
    transactionDate,
    valueDate,
    amountCents: rowAmount(row, columns, line),
    rawDescription,
  };
}

function rowAmount(row: string[], columns: ColumnMap, line: number): bigint {
  try {
    if (columns.amount !== null) {
      return parseBankAmount(cell(row, columns.amount));
    }
    const debit = columns.debit === null ? 0n : signedColumn(cell(row, columns.debit), "debit");
    const credit = columns.credit === null ? 0n : signedColumn(cell(row, columns.credit), "credit");
    return credit - debit;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid amount";
    throw new CsvStatementError(`Line ${line}: ${message}`);
  }
}

function signedColumn(raw: string, side: "debit" | "credit"): bigint {
  if (raw.trim() === "") {
    return 0n;
  }
  const cents = parseBankAmount(raw);
  const absolute = cents < 0n ? -cents : cents;
  return side === "debit" ? absolute : absolute;
}

function cell(row: string[], index: number): string {
  return row[index] ?? "";
}

function parseDate(raw: string, line: number): Date {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso !== null) {
    return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), line);
  }
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);
  if (dmy !== null) {
    return utcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]), line);
  }
  throw new CsvStatementError(`Line ${line} has an invalid date "${raw}"`);
}

function utcDate(year: number, month: number, day: number, line: number): Date {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new CsvStatementError(`Line ${line} has an invalid date`);
  }
  return date;
}

function findHeader(indexes: Map<string, number>, names: Set<string>): number | null {
  for (const name of names) {
    const index = indexes.get(name);
    if (index !== undefined) {
      return index;
    }
  }
  return null;
}

function headerKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function detectDelimiter(text: string): "," | ";" {
  const line = text.split("\n")[0] ?? "";
  const commas = countDelimiter(line, ",");
  const semicolons = countDelimiter(line, ";");
  return semicolons > commas ? ";" : ",";
}

function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (const character of line) {
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

function parseRows(text: string, delimiter: "," | ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cellValue += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cellValue);
      cellValue = "";
      continue;
    }
    if (!quoted && character === "\n") {
      row.push(cellValue);
      rows.push(row);
      row = [];
      cellValue = "";
      continue;
    }
    cellValue += character ?? "";
  }
  if (cellValue.length > 0 || row.length > 0) {
    row.push(cellValue);
    rows.push(row);
  }
  return rows;
}
