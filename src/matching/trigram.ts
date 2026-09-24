/**
 * Jaccard similarity over character trigrams, padded like PostgreSQL pg_trgm
 * (two spaces before the string, one after). Inputs should already be folded.
 */
export function trigramSimilarity(left: string, right: string): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const leftGrams = trigrams(left);
  const rightGrams = trigrams(right);
  let shared = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) {
      shared += 1;
    }
  }
  const union = leftGrams.size + rightGrams.size - shared;
  if (union === 0) {
    return 0;
  }
  return shared / union;
}

/** Similarity as an integer from 0 to 10_000, so money-adjacent scores stay off floats. */
export function trigramScore(left: string, right: string): number {
  const leftGrams = trigrams(left);
  const rightGrams = trigrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) {
      shared += 1;
    }
  }
  const union = leftGrams.size + rightGrams.size - shared;
  if (union === 0) {
    return 0;
  }
  return Math.round((shared * 10_000) / union);
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    grams.add(padded.slice(index, index + 3));
  }
  return grams;
}
