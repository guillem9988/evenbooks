import { describe, expect, it } from "vitest";
import { previewModelo130 } from "./modelo-130.js";

describe("modelo 130 preview", () => {
  it("charges 20% of a positive net and nothing on a loss", () => {
    const positive = previewModelo130(100000n, 40000n);
    expect(positive.netCents).toBe(60000n);
    expect(positive.paymentCents).toBe(12000n);
    expect(positive.rate).toBe("0.20");

    const negative = previewModelo130(10000n, 40000n);
    expect(negative.netCents).toBe(-30000n);
    expect(negative.paymentCents).toBe(0n);
  });
});
