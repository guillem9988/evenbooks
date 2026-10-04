import { ExpenseCategory, type PrismaClient } from "../../generated/prisma/client.js";

const CATEGORIES = new Set<string>(Object.values(ExpenseCategory));

/** Reads a category name from an extractor, accepting any case. Unknown values are null. */
export function parseCategory(value: string | null | undefined): ExpenseCategory | null {
  const upper = value?.trim().toUpperCase();
  return upper !== undefined && CATEGORIES.has(upper) ? (upper as ExpenseCategory) : null;
}

/** Shared wording for every LLM prompt, so all extractors classify the same way. */
export const CATEGORY_PROMPT =
  "expense_category: one of OFFICE (office supplies, equipment, rent, utilities, phone, internet), TRAVEL (transport, fuel, tolls, parking, hotels), SOFTWARE (software, SaaS, cloud, hosting, domains), MEALS (restaurants, cafés, food delivery) or OTHER; null only if the document is unreadable.";

/** Whole-word, case-insensitive alternation. Unlike `\b`, the boundaries understand accented letters (café, peatge). */
function words(alternation: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])(?:${alternation})(?![\\p{L}\\d])`, "iu");
}

/** Ordered: the first rule whose pattern matches the vendor (or, failing that, the text) wins. */
const RULES: Array<[ExpenseCategory, RegExp]> = [
  [
    ExpenseCategory.SOFTWARE,
    words(String.raw`adobe|github|gitlab|atlassian|jira|notion|slack|figma|canva|dropbox|openai|anthropic|vercel|render\.com|netlify|heroku|digitalocean|hetzner|ovh|ionos|godaddy|namecheap|cloudflare|aws|amazon web services|google (cloud|workspace)|microsoft|office 365|zoom|1password|jetbrains|shopify|wix|squarespace|mailchimp|hosting|dominio|domini|software|saas|subscripci[oó]n?`),
  ],
  [
    ExpenseCategory.TRAVEL,
    words(String.raw`renfe|ouigo|iryo|vueling|iberia|ryanair|easyjet|air europa|uber|cabify|bolt|free ?now|taxi|blablacar|alsa|tmb|metro|bus|booking\.com|airbnb|hotel|hostal|repsol|cepsa|galp|bp|shell|petronor|gasolinera|benzinera|carburant|combustible|parking|aparcament|aparcamiento|peaje|peatge|autopista|abertis|avis|hertz|europcar|sixt`),
  ],
  [
    ExpenseCategory.MEALS,
    words(String.raw`restaurant|restaurante|bar|cafeteria|cafè|café|caf[eé]|pizzeria|bodega|taberna|tasca|glovo|just ?eat|deliveroo|uber ?eats|mcdonald'?s|burger king|telepizza|starbucks|men[uú] del d[ií]a`),
  ],
  [
    ExpenseCategory.OFFICE,
    words(String.raw`amazon|fnac|media ?markt|pc ?componentes|apple|staples|office|oficina|papeler[ií]a|paperer[ií]a|ikea|leroy merlin|movistar|telef[oó]nica|vodafone|orange|digi|simyo|masmovil|pepephone|o2|endesa|iberdrola|naturgy|holaluz|aig[uü]es|agua|lloguer|alquiler|coworking`),
  ],
];

/** Keyword guess from the vendor name and, if that says nothing, the document text. Null when nothing matches. */
export function guessCategory(vendorName: string | null, text: string | null = null): ExpenseCategory | null {
  for (const source of [vendorName, text]) {
    if (!source) continue;
    for (const [category, pattern] of RULES) {
      if (pattern.test(source)) return category;
    }
  }
  return null;
}

/**
 * Picks a category for a new expense: the category this organization last gave the same vendor
 * (by tax ID, then by name), then what the AI extractor proposed, then keyword rules.
 */
export async function suggestCategory(
  prisma: PrismaClient,
  organizationId: string,
  input: { vendorName: string | null; vendorTaxId: string | null; aiCategory?: ExpenseCategory | null; text?: string | null; excludeId?: string },
): Promise<ExpenseCategory | null> {
  const vendorMatch = [
    ...(input.vendorTaxId ? [{ vendorTaxId: input.vendorTaxId }] : []),
    ...(input.vendorName ? [{ vendorName: { equals: input.vendorName, mode: "insensitive" as const } }] : []),
  ];
  if (vendorMatch.length > 0) {
    const previous = await prisma.invoice.findFirst({
      where: {
        organizationId,
        expenseCategory: { not: null },
        OR: vendorMatch,
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { expenseCategory: true },
    });
    if (previous?.expenseCategory) return previous.expenseCategory;
  }
  return input.aiCategory ?? guessCategory(input.vendorName, input.text ?? null);
}
