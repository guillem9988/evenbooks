import { parseBankCsv, StatementFileError, type ParsedBankTransaction } from "./parse-csv.js";
import { parseBankOfx } from "./parse-ofx.js";
import { parseBankXlsx } from "./parse-xlsx.js";

const EXTENSIONS = new Set(["csv", "ofx", "qfx", "xlsx"]);

export function statementExtension(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  const extension = match?.[1]?.toLowerCase() ?? "";
  return EXTENSIONS.has(extension) ? extension : null;
}

export async function parseStatementFile(filename: string, bytes: Buffer): Promise<ParsedBankTransaction[]> {
  const extension = statementExtension(filename);
  if (extension === null) {
    throw new StatementFileError("Unsupported statement file");
  }
  if (extension === "csv") {
    return parseBankCsv(bytes.toString("utf8"));
  }
  if (extension === "ofx" || extension === "qfx") {
    return parseBankOfx(bytes.toString("utf8"));
  }
  return parseBankXlsx(bytes);
}
