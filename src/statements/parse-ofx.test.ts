import { describe, expect, it } from "vitest";
import { parseBankOfx } from "./parse-ofx.js";

const debit = `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260312120000
<TRNAMT>-12.50
<NAME>Cafe Central
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe("parseBankOfx", () => {
  it("stores an OFX debit as negative cents", () => {
    const [row] = parseBankOfx(debit);
    expect(row?.amountCents).toBe(-1250n);
    expect(typeof row?.amountCents).toBe("bigint");
    expect(row?.rawDescription).toBe("Cafe Central");
    expect(row?.transactionDate.toISOString()).toBe("2026-03-12T00:00:00.000Z");
  });
});
