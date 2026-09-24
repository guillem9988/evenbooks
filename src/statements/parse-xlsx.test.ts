import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseBankXlsx } from "./parse-xlsx.js";

describe("parseBankXlsx", () => {
  it("stores a European comma amount as signed cents", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Movimientos");
    sheet.addRow(["Fecha", "Concepto", "Importe"]);
    sheet.addRow(["12/03/2026", "Acme SL", "-121,00"]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

    const [row] = await parseBankXlsx(bytes);
    expect(row?.amountCents).toBe(-12100n);
    expect(typeof row?.amountCents).toBe("bigint");
    expect(row?.rawDescription).toBe("Acme SL");
  });
});
