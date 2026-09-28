/** Formats integer cents as euros with a decimal comma: `350` is `3,50 €`, `123450` is `1.234,50 €`. */
export function euros(cents: string | bigint | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") {
    return "—";
  }
  const text = cents.toString();
  const negative = text.startsWith("-");
  const digits = (negative ? text.slice(1) : text).replace(/\D/g, "") || "0";
  const padded = digits.padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${whole},${padded.slice(-2)} €`;
}

/** Euro amount for an input, without the currency sign or thousands dots. 350 cents is `3,50`. */
export function euroInput(cents: string): string {
  return euros(cents).replace(" €", "").replace(/\./g, "");
}

/**
 * Parses what a person types into integer cents as a string.
 * Accepts `3`, `3,5`, `3,50`, `3.50` and `1.234,50`. Returns null when it is not an amount.
 */
export function parseEuroInput(raw: string): string | null {
  let value = raw.trim().replace("€", "").replace(/\s/g, "");
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value)) {
    value = value.replace(/\./g, "");
  }
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    return null;
  }
  const [whole = "0", fraction = ""] = value.split(/[.,]/);
  return BigInt(`${whole}${fraction.padEnd(2, "0")}`).toString();
}

export type EuroMessages = { required: string; invalid: string; zero: string };

/** Validation message for a euro field, or null when the value is fine. */
export function euroError(raw: string, { allowZero = false, messages }: { allowZero?: boolean; messages: EuroMessages }): string | null {
  if (raw.trim() === "") return messages.required;
  const cents = parseEuroInput(raw);
  if (cents === null) return messages.invalid;
  if (!allowZero && cents === "0") return messages.zero;
  return null;
}
