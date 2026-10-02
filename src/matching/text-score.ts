const STOPWORDS = new Set([
  "sl",
  "sa",
  "slu",
  "sau",
  "inc",
  "llc",
  "compra",
  "tpv",
  "targeta",
  "tarjeta",
  "sociedad",
  "limitada",
  "anonima",
  "pago",
  "pagament",
  "recibo",
  "rebut",
  "adeudo",
  "cargo",
  "carrec",
  "sepa",
  "transf",
  "transferencia",
  "bizum",
  "cuota",
  "quota",
  "abono",
  "factura",
  "fra",
]);

export function textSimilarity(vendorName: string, description: string): number {
  const vendorTokens = tokens(vendorName);
  const descriptionTokens = tokens(description);
  if (vendorTokens.length === 0 || descriptionTokens.length === 0) {
    return 0;
  }
  let best = 0;
  for (const vendorToken of vendorTokens) {
    for (const descriptionToken of descriptionTokens) {
      best = Math.max(best, tokenSimilarity(vendorToken, descriptionToken));
    }
  }
  return best;
}

function tokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function tokenSimilarity(left: string, right: string): number {
  const combined = (normalizedLevenshtein(left, right) + jaroWinkler(left, right)) / 2;
  if (left.length >= 3 && right.length >= 3 && (isSubsequence(left, right) || isSubsequence(right, left))) {
    return Math.max(combined, 0.9);
  }
  return combined;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) {
      index += 1;
      if (index === needle.length) {
        return true;
      }
    }
  }
  return false;
}

function normalizedLevenshtein(left: string, right: string): number {
  const distance = levenshtein(left, right);
  const longest = Math.max(left.length, right.length);
  if (longest === 0) {
    return 0;
  }
  return 1 - distance / longest;
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);
  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      );
    }
    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column] ?? 0;
    }
  }
  return previous[right.length] ?? 0;
}

function jaroWinkler(left: string, right: string): number {
  const jaro = jaroScore(left, right);
  let prefix = 0;
  const limit = Math.min(4, left.length, right.length);
  while (prefix < limit && left[prefix] === right[prefix]) {
    prefix += 1;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

function jaroScore(left: string, right: string): number {
  if (left === right) {
    return left.length === 0 ? 0 : 1;
  }
  const window = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
  const leftMatches = new Array<boolean>(left.length).fill(false);
  const rightMatches = new Array<boolean>(right.length).fill(false);
  let matches = 0;
  for (let index = 0; index < left.length; index += 1) {
    const start = Math.max(0, index - window);
    const end = Math.min(index + window + 1, right.length);
    for (let cursor = start; cursor < end; cursor += 1) {
      if (rightMatches[cursor] === true || left[index] !== right[cursor]) {
        continue;
      }
      leftMatches[index] = true;
      rightMatches[cursor] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) {
    return 0;
  }
  let transpositions = 0;
  let rightIndex = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (leftMatches[index] !== true) {
      continue;
    }
    while (rightMatches[rightIndex] !== true) {
      rightIndex += 1;
    }
    if (left[index] !== right[rightIndex]) {
      transpositions += 1;
    }
    rightIndex += 1;
  }
  return (matches / left.length + matches / right.length + (matches - transpositions / 2) / matches) / 3;
}
