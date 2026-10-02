import { parseBankCsv, StatementFileError, type ParsedBankTransaction } from "./parse-csv.js";
import { parseBankNorma43 } from "./parse-n43.js";
import { parseBankOfx } from "./parse-ofx.js";
import { parseBankXlsx } from "./parse-xlsx.js";

const EXTENSIONS = new Set(["csv", "ofx", "qfx", "xlsx", "xls", "n43", "c43", "txt"]);

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
  if (extension === "n43" || extension === "c43") {
    return parseBankNorma43(bytes);
  }
  if (extension === "txt") {
    // If it starts with record 11 and looks like Norma 43
    const snippet = bytes.slice(0, 100).toString("ascii");
    if (/^11\d{8}/.test(snippet.trim())) {
      try {
        return parseBankNorma43(bytes);
      } catch {
        // Fall back to CSV if N43 parsing fails
      }
    }
    return parseBankCsv(bytes.toString("utf8"));
  }
  if (extension === "csv") {
    return parseBankCsv(bytes.toString("utf8"));
  }
  if (extension === "ofx" || extension === "qfx") {
    return parseBankOfx(bytes.toString("utf8"));
  }
  return parseBankXlsx(bytes);
}
