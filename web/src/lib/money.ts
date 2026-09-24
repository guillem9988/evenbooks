export function euros(cents: string | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") {
    return "—";
  }
  const negative = cents.startsWith("-");
  const digits = (negative ? cents.slice(1) : cents).replace(/\D/g, "") || "0";
  const padded = digits.padStart(3, "0");
  return `${negative ? "-" : ""}${padded.slice(0, -2)},${padded.slice(-2)} €`;
}

export function parseEuroInput(raw: string): string | null {
  const value = raw.trim().replace("€", "").replace(/\s/g, "");
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    return null;
  }
  const separator = value.includes(",") ? "," : value.includes(".") ? "." : "";
  const [whole, fraction = ""] = separator === "" ? [value, ""] : value.split(separator);
  if (whole === undefined) {
    return null;
  }
  return `${whole}${fraction.padEnd(2, "0")}`;
}
