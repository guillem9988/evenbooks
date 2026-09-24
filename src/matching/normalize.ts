const NOISE =
  /\b(sepa|adeudo|recibo|transferencia|transference|transfer|bizum|tarjeta|compra|card|tpv|factura|invoice|payment|pago|n[uú]m(?:ero)?|ref|reference)\b/gi;

export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** NIF/CIF/NIE without spaces, dashes, or a leading country code. */
export function normalizeTaxId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const compact = value.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutCountry = compact.startsWith("ES") ? compact.slice(2) : compact;
  return withoutCountry.length >= 8 ? withoutCountry : null;
}
