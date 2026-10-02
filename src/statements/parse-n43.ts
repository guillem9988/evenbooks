import { StatementFileError, type ParsedBankTransaction } from "./parse-csv.js";

export class Norma43StatementError extends StatementFileError {
  constructor(message: string) {
    super(message);
    this.name = "Norma43StatementError";
  }
}

/**
 * Parses a Norma 43 (CSB 43 / AEB 43) Spanish bank statement file.
 * Accepts either a string or raw Buffer (which will be safely decoded as Latin1 / UTF-8).
 */
export function parseBankNorma43(input: string | Buffer): ParsedBankTransaction[] {
  const content = typeof input === "string" ? input : decodeNorma43Buffer(input);
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Norma43StatementError("El fitxer Norma 43 està buit");
  }

  const transactions: ParsedBankTransaction[] = [];
  let currentTx: {
    transactionDate: Date;
    valueDate: Date;
    amountCents: bigint;
    descriptions: string[];
  } | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.length < 2) continue;

    const recordType = line.slice(0, 2);

    if (recordType === "11") {
      // Header record: 11
      continue;
    }

    if (recordType === "22") {
      // Finalize previous transaction if any
      if (currentTx !== null) {
        transactions.push(finalizeTx(currentTx));
        currentTx = null;
      }

      if (line.length < 42) {
        throw new Norma43StatementError(`Registre 22 invàlid a la línia ${index + 1}: massa curt`);
      }

      // Positions in record 22 (0-indexed):
      // 10..16: Operation Date (YYMMDD)
      // 16..22: Value Date (YYMMDD)
      // 27..28: Sign / Debit-Credit (1 = Debe / càrrec / negatiu, 2 = Haber / abono / positiu)
      // 28..42: Amount in cents (14 digits)
      // 52..80: Reference / Description 1 (optional)
      const opDateStr = line.slice(10, 16);
      const valDateStr = line.slice(16, 22);
      const sign = line.slice(27, 28);
      const amountStr = line.slice(28, 42);
      const refDesc = line.slice(52).trim();

      const transactionDate = parseN43Date(opDateStr, index + 1);
      const valueDate = valDateStr.trim().length === 6 ? parseN43Date(valDateStr, index + 1) : transactionDate;

      if (!/^\d+$/.test(amountStr)) {
        throw new Norma43StatementError(`Import invàlid a la línia ${index + 1}: "${amountStr}"`);
      }

      const rawCents = BigInt(amountStr);
      const amountCents = sign === "1" ? -rawCents : rawCents;

      currentTx = {
        transactionDate,
        valueDate,
        amountCents,
        descriptions: refDesc.length > 0 ? [refDesc] : [],
      };
    } else if (recordType === "23") {
      // Complementary record: 23
      if (currentTx === null) {
        continue; // Or ignore orphan record 23
      }
      // Record 23 layout:
      // 0..2: "23"
      // 2..4: concept code
      // 4..42: concept line 1 (up to 38 chars)
      // 42..80: concept line 2 (optional, up to 38 chars)
      const part1 = line.slice(4, 42).trim();
      const part2 = line.length > 42 ? line.slice(42, 80).trim() : "";

      if (part1.length > 0) currentTx.descriptions.push(part1);
      if (part2.length > 0) currentTx.descriptions.push(part2);
    } else if (recordType === "33") {
      // Account summary record: 33
      if (currentTx !== null) {
        transactions.push(finalizeTx(currentTx));
        currentTx = null;
      }
    } else if (recordType === "88") {
      // File end record: 88
      if (currentTx !== null) {
        transactions.push(finalizeTx(currentTx));
        currentTx = null;
      }
      break;
    }
  }

  if (currentTx !== null) {
    transactions.push(finalizeTx(currentTx));
  }

  return transactions;
}

function finalizeTx(tx: {
  transactionDate: Date;
  valueDate: Date;
  amountCents: bigint;
  descriptions: string[];
}): ParsedBankTransaction {
  const rawDescription = tx.descriptions.join(" ").replace(/\s+/g, " ").trim() || "Moviment bancari";
  return {
    transactionDate: tx.transactionDate,
    valueDate: tx.valueDate,
    amountCents: tx.amountCents,
    rawDescription,
  };
}

function parseN43Date(yymmdd: string, lineNum: number): Date {
  if (yymmdd.length !== 6 || !/^\d{6}$/.test(yymmdd)) {
    throw new Norma43StatementError(`Data Norma 43 invàlida a la línia ${lineNum}: "${yymmdd}"`);
  }
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10) - 1;
  const dd = parseInt(yymmdd.slice(4, 6), 10);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;

  const date = new Date(Date.UTC(year, mm, dd, 0, 0, 0, 0));
  if (isNaN(date.getTime()) || date.getUTCDate() !== dd || date.getUTCMonth() !== mm) {
    throw new Norma43StatementError(`Data Norma 43 fora de rang a la línia ${lineNum}: "${yymmdd}"`);
  }
  return date;
}

function decodeNorma43Buffer(bytes: Buffer): string {
  // Try UTF-8 first; if contains invalid replacement chars or ISO-8859 characters, decode with latin1
  const asUtf8 = bytes.toString("utf8");
  if (!asUtf8.includes("\uFFFD")) {
    return asUtf8;
  }
  return bytes.toString("latin1");
}
