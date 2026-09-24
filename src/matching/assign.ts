import { SUGGESTION_MIN, type ScoredPair } from "./score.js";

export interface Assignment {
  confirmed: ScoredPair[];
  suggestions: ScoredPair[];
}

/** One invoice and one transaction each. Higher confidence wins; ids break ties. */
export function assignMatches(pairs: readonly ScoredPair[]): Assignment {
  const ranked = [...pairs].sort((left, right) => {
    if (right.confidencePoints !== left.confidencePoints) {
      return right.confidencePoints - left.confidencePoints;
    }
    if (left.transactionId !== right.transactionId) {
      return left.transactionId < right.transactionId ? -1 : 1;
    }
    return left.invoiceId < right.invoiceId ? -1 : left.invoiceId > right.invoiceId ? 1 : 0;
  });

  const usedTransactions = new Set<string>();
  const usedInvoices = new Set<string>();
  const confirmed: ScoredPair[] = [];
  const suggestions: ScoredPair[] = [];

  for (const pair of ranked) {
    if (pair.confidencePoints < SUGGESTION_MIN) {
      continue;
    }
    if (usedTransactions.has(pair.transactionId) || usedInvoices.has(pair.invoiceId)) {
      continue;
    }
    usedTransactions.add(pair.transactionId);
    usedInvoices.add(pair.invoiceId);
    if (pair.autoConfirm) {
      confirmed.push(pair);
    } else {
      suggestions.push(pair);
    }
  }

  return { confirmed, suggestions };
}
