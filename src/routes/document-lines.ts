import { computeDocument, parseCents, parsePositiveInt, parseTaxPercent, type ComputedDocument } from "../billing/lines.js";

export function readLines(value: unknown): ComputedDocument | Error {
  if (!Array.isArray(value) || value.length === 0) {
    return new Error("lines must include at least one row");
  }
  const inputs = [];
  for (const row of value) {
    const line = row as { description?: unknown; quantity?: unknown; unitAmountCents?: unknown; taxRate?: unknown };
    if (typeof line.description !== "string" || line.description.trim() === "") {
      return new Error("each line needs a description");
    }
    const quantity = parsePositiveInt(line.quantity);
    const unitAmountCents = parseCents(line.unitAmountCents);
    const taxRate = parseTaxPercent(line.taxRate);
    if (quantity === null || unitAmountCents === null || taxRate === null) {
      return new Error("each line needs an integer quantity, integer unitAmountCents, and tax rate 21, 10, 4, or 0");
    }
    inputs.push({ description: line.description.trim().slice(0, 500), quantity, unitAmountCents, taxRate });
  }
  return computeDocument(inputs);
}
