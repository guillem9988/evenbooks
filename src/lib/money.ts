/**
 * Money is integer cents (PostgreSQL BIGINT). Never use number/float for amounts.
 * Spanish IVA (21 / 10 / 4 / 0) has to be applied in cents so totals do not drift.
 */

const EURO_AMOUNT = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function assertIntegerCents(value: bigint): bigint {
  if (typeof value !== "bigint") {
    throw new TypeError("Money must be integer cents as bigint, never a float");
  }
  return value;
}

export function parseEurosToCents(amount: string): bigint {
  const trimmed = amount.trim();
  if (!EURO_AMOUNT.test(trimmed)) {
    throw new Error(
      `Invalid euro amount "${amount}". Use a decimal string with at most two fractional digits.`,
    );
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const parts = unsigned.split(".");
  const wholePart = parts[0];
  if (wholePart === undefined) {
    throw new Error(`Invalid euro amount "${amount}".`);
  }
  const fractionPart = (parts[1] ?? "").padEnd(2, "0");
  const cents = BigInt(wholePart) * 100n + BigInt(fractionPart);
  return negative ? -cents : cents;
}

export function formatCents(cents: bigint): string {
  assertIntegerCents(cents);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function addCents(left: bigint, right: bigint): bigint {
  assertIntegerCents(left);
  assertIntegerCents(right);
  return left + right;
}
