import { describe, expect, it } from "vitest";
import { parseBankNorma43 } from "./parse-n43.js";

describe("parseBankNorma43", () => {
  it("parses header, movements, and complementary records correctly", () => {
    // Standard Norma 43 sample:
    // Header (11)
    // Movement 1 (22): debit 121,00 € (sign 1), ref: PAGO ENDESA
    // Complementary (23): ENERGIA XXI SL
    // Movement 2 (22): credit 500,00 € (sign 2), ref: TRANSFERENCIA RECIBIDA
    // Footer (33), End (88)
    const n43Content = [
      "110049000101234567892601012601312000000001000009783EMPRESA SL                  ",
      "220001    260115260115010011000000000121000000000000PAGO FACTURA ENDESA        ",
      "2301ENERGIA XXI SL                    REF: 2026/012                         ",
      "220001    260120260120010022000000000500000000000000TRANSFERENCIA CLIENTE      ",
      "330049000101234567890000010000000001210000000100000000050000200000000137900978 ",
      "889999990000010000060000000000000000                                            ",
    ].join("\n");

    const result = parseBankNorma43(n43Content);

    expect(result).toHaveLength(2);

    expect(result[0]!.amountCents).toBe(-12100n);
    expect(result[0]!.transactionDate.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(result[0]!.rawDescription).toBe("PAGO FACTURA ENDESA ENERGIA XXI SL REF: 2026/012");

    expect(result[1]!.amountCents).toBe(50000n);
    expect(result[1]!.transactionDate.toISOString().slice(0, 10)).toBe("2026-01-20");
    expect(result[1]!.rawDescription).toBe("TRANSFERENCIA CLIENTE");
  });

  it("handles negative and positive movements without complementary records", () => {
    const n43Content = [
      "110049000101234567892601012601312000000001000009783EMPRESA SL                  ",
      "220001    260310260310010011000000000045990000000000RESTAURANT BCN             ",
      "330049000101234567890000010000000000459900000000000000000000200000000095401978 ",
      "889999990000010000040000000000000000                                            ",
    ].join("\n");

    const result = parseBankNorma43(n43Content);
    expect(result).toHaveLength(1);
    expect(result[0]!.amountCents).toBe(-4599n);
    expect(result[0]!.rawDescription).toBe("RESTAURANT BCN");
  });
});
