import ExcelJS from "exceljs";
import { parseBankTable, StatementFileError, type ParsedBankTransaction } from "./parse-csv.js";

export async function parseBankXlsx(bytes: Uint8Array): Promise<ParsedBankTransaction[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  } catch {
    throw new StatementFileError("Unreadable workbook");
  }
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    throw new StatementFileError("Unreadable workbook");
  }

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const width = Math.max(row.cellCount, row.actualCellCount);
    const cells: string[] = [];
    for (let index = 1; index <= width; index += 1) {
      cells.push(cellText(row.getCell(index)));
    }
    rows.push(cells);
  });
  if (rows.length === 0) {
    throw new StatementFileError("Unreadable workbook");
  }
  return parseBankTable(rows);
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  if (typeof value === "object" && "result" in value) {
    const result = value.result;
    if (result === null || result === undefined) {
      return "";
    }
    if (result instanceof Date) {
      return result.toISOString().slice(0, 10);
    }
    return String(result);
  }
  return cell.text;
}
