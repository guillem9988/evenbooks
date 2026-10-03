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
    const leftTarget = left.targetType === "ISSUED" ? (left.issuedInvoiceId ?? "") : (left.invoiceId ?? "");
    const rightTarget = right.targetType === "ISSUED" ? (right.issuedInvoiceId ?? "") : (right.invoiceId ?? "");
    return leftTarget < rightTarget ? -1 : leftTarget > rightTarget ? 1 : 0;
  });

  const usedTransactions = new Set<string>();
  const usedTargets = new Set<string>();
  const confirmed: ScoredPair[] = [];
  const suggestions: ScoredPair[] = [];

  for (const pair of ranked) {
    if (pair.confidencePoints < SUGGESTION_MIN) {
      continue;
    }
    const targetKey = `${pair.targetType}:${pair.targetType === "ISSUED" ? pair.issuedInvoiceId : pair.invoiceId}`;
    if (usedTransactions.has(pair.transactionId) || usedTargets.has(targetKey)) {
      continue;
    }
    usedTransactions.add(pair.transactionId);
    usedTargets.add(targetKey);
    if (pair.autoConfirm) {
      confirmed.push(pair);
    } else {
      suggestions.push(pair);
    }
  }

  return { confirmed, suggestions };
}
