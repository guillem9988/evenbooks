import { describe, expect, it } from "vitest";
import { parseBankAmount, parseBankCsv } from "./parse-csv.js";

describe("parseBankCsv", () => {
  it("stores a negative amount as signed cents", () => {
    const [row] = parseBankCsv("Date,Description,Amount\n2026-03-12,Cafe,-12.50\n");
    expect(row?.amountCents).toBe(-1250n);
    expect(typeof row?.amountCents).toBe("bigint");
  });

  it("accepts a European decimal comma", () => {
    const [row] = parseBankCsv("Fecha;Concepto;Importe\n12/03/2026;Acme SL;-121,00\n");
    expect(row?.amountCents).toBe(-12100n);
    expect(row?.rawDescription).toBe("Acme SL");
    expect(row?.transactionDate.toISOString()).toBe("2026-03-12T00:00:00.000Z");
  });

  it("accepts Date/Description/Amount and Fecha/Concepto/Importe headers", () => {
    const english = parseBankCsv("Date,Description,Amount\n2026-01-02,  Rent   payment  ,100.00\n");
    const spanish = parseBankCsv('Fecha,Concepto,Importe\n02/01/2026,Alquiler,"100,00"\n');
    expect(english[0]?.rawDescription).toBe("Rent payment");
    expect(english[0]?.amountCents).toBe(10000n);
    expect(spanish[0]?.rawDescription).toBe("Alquiler");
    expect(spanish[0]?.amountCents).toBe(10000n);
  });

  it("turns a debit column into a negative expense and a credit column into income", () => {
    const rows = parseBankCsv("Fecha;Concepto;Debe;Haber\n01/02/2026;Suministros;45,10;\n02/02/2026;Cobro;;80,00\n");
    expect(rows[0]?.amountCents).toBe(-4510n);
    expect(rows[1]?.amountCents).toBe(8000n);
  });

  it("handles bank preamble rows (CaixaBank / BBVA / Santander) and Catalan headers", () => {
    const content = [
      "Titular: EMPRESA SL",
      "Compte: ES12 3456 7890 1234 5678",
      "Data;Data valor;Concepte;Import;Saldo",
      "15/03/2026;15/03/2026;PAGAMENT RESTAURANT;-54,20;1.200,00",
      "16/03/2026;16/03/2026;TRANSFERENCIA CLIENT;350,00;1.550,00",
    ].join("\n");
    const rows = parseBankCsv(content);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.amountCents).toBe(-5420n);
    expect(rows[0]?.rawDescription).toBe("PAGAMENT RESTAURANT");
    expect(rows[1]?.amountCents).toBe(35000n);
  });
});

describe("parseBankAmount", () => {
  it("does not use floating point for -121,00", () => {
    expect(parseBankAmount("-121,00")).toBe(-12100n);
    expect(parseBankAmount("1.234,56")).toBe(123456n);
  });
});
