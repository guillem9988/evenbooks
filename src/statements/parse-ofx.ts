import {
  cleanDescription,
  parseBankAmount,
  StatementFileError,
  type ParsedBankTransaction,
} from "./parse-csv.js";

export function parseBankOfx(content: string): ParsedBankTransaction[] {
  const text = content.replace(/^\uFEFF/, "");
  if (!/<OFX[\s>]/i.test(text) && !/<STMTTRN>/i.test(text)) {
    throw new StatementFileError("Unreadable OFX file");
  }
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) {
    throw new StatementFileError("OFX file has no transactions");
  }

  return blocks.map((block, index) => {
    const body = block.split(/<\/STMTTRN>/i)[0] ?? block;
    const posted = tag(body, "DTPOSTED");
    const amount = tag(body, "TRNAMT");
    const description = cleanDescription(tag(body, "NAME") || tag(body, "MEMO"));
    if (posted === "" || amount === "" || description === "") {
      throw new StatementFileError(`OFX transaction ${index + 1} is missing a date, amount, or description`);
    }
    let amountCents = parseBankAmount(amount);
    if (tag(body, "TRNTYPE").toUpperCase() === "DEBIT" && amountCents > 0n) {
      amountCents = -amountCents;
    }
    const transactionDate = parseOfxDate(posted);
    return {
      transactionDate,
      valueDate: transactionDate,
      amountCents,
      rawDescription: description,
    };
  });
}

function tag(block: string, name: string): string {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return match?.[1]?.trim() ?? "";
}

function parseOfxDate(raw: string): Date {
  const digits = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (digits === null) {
    throw new StatementFileError(`Invalid OFX date "${raw}"`);
  }
  const year = Number(digits[1]);
  const month = Number(digits[2]);
  const day = Number(digits[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new StatementFileError(`Invalid OFX date "${raw}"`);
  }
  return date;
}
