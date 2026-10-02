import OpenAI from "openai";
import { InvoiceStatus, MatchStatus, type PrismaClient } from "../../generated/prisma/client.js";

export interface AiMatchProposal {
  transactionId: string;
  invoiceId: string;
  confidenceScore: string;
  reason: string;
}

export interface AiClassification {
  transactionId: string;
  suggestedType: "BANK_FEE" | "TAX" | "PAYROLL" | "SOCIAL_SECURITY" | "OTHER";
  reason: string;
}

export interface AiReconcileResult {
  aiMatches: AiMatchProposal[];
  classifications: AiClassification[];
}

const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

export async function aiReconcileOrganization(
  prisma: PrismaClient,
  organizationId: string,
): Promise<AiReconcileResult> {
  const [organization, transactions, invoices] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        geminiApiKey: true,
        openaiApiKey: true,
        anthropicApiKey: true,
        deepseekApiKey: true,
        extractorModel: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: { organizationId, matchStatus: MatchStatus.UNMATCHED },
      orderBy: { transactionDate: "desc" },
      take: 30,
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: InvoiceStatus.PARSED,
        reconciliation: null,
      },
      orderBy: { invoiceDate: "desc" },
      take: 50,
    }),
  ]);

  if (!organization || transactions.length === 0) {
    return { aiMatches: [], classifications: [] };
  }

  const geminiKey = organization.geminiApiKey || process.env.GEMINI_API_KEY || null;
  const openAiKey = organization.openaiApiKey || process.env.OPENAI_API_KEY || null;

  if (!geminiKey && !openAiKey) {
    return { aiMatches: [], classifications: [] };
  }

  const prompt = buildReconcilePrompt(transactions, invoices);

  let rawJson: string | null = null;

  if (geminiKey) {
    rawJson = await callGemini(geminiKey, prompt, organization.extractorModel);
  } else if (openAiKey) {
    rawJson = await callOpenAi(openAiKey, prompt);
  }

  if (!rawJson) {
    return { aiMatches: [], classifications: [] };
  }

  return parseAiResponse(rawJson, transactions, invoices);
}

function buildReconcilePrompt(
  transactions: Array<{
    id: string;
    transactionDate: Date;
    amountCents: bigint;
    rawDescription: string;
  }>,
  invoices: Array<{
    id: string;
    vendorName: string | null;
    vendorTaxId: string | null;
    invoiceNumber: string | null;
    invoiceDate: Date | null;
    totalAmountCents: bigint | null;
  }>,
): string {
  const txLines = transactions.map((t) => ({
    id: t.id,
    date: t.transactionDate.toISOString().slice(0, 10),
    amountEur: (Number(t.amountCents) / 100).toFixed(2),
    rawDescription: t.rawDescription,
  }));

  const invLines = invoices.map((inv) => ({
    id: inv.id,
    date: inv.invoiceDate?.toISOString().slice(0, 10) ?? null,
    totalEur: inv.totalAmountCents !== null ? (Number(inv.totalAmountCents) / 100).toFixed(2) : null,
    vendorName: inv.vendorName,
    vendorTaxId: inv.vendorTaxId,
    invoiceNumber: inv.invoiceNumber,
  }));

  return `Ets un expert comptable i fiscal especialitzat en conciliació bancària d'empreses i autònoms.
Analitza aquests moviments bancaris pendents i aquestes factures rebudes pendents.

MOVIMENTS BANCARIS PENDENTS:
${JSON.stringify(txLines, null, 2)}

FACTURES PENDENTS:
${JSON.stringify(invLines, null, 2)}

CRITERIS DE CONCILIACIÓ:
1. Els moviments de despesa al banc tenen import negatiu (ex: -121.00 €) i coincideixen amb factures de total positiu (121.00 €).
2. Tingues en compte noms comercials vs raó social:
   - Ex: AMZN MKTP / AMAZON PAYMENTS -> Amazon
   - Ex: MAXI MOBILITY -> Cabify
   - Ex: STRIPE / WORLDPAY / PAYPAL -> passarel·les de pagament de SaaS o botigues
   - Ex: ENDESA / IBERDROLA / NATURGY / ENERGIA XXI / AIGUES -> subministraments
   - Ex: REPSOL / CEPSA / BP / SHELL -> combustible / transports
3. Revisa si part del número de factura o el NIF/CIF apareix al concepte bancari.
4. Si un moviment és clarament un impost (AEAT, Model 303, 111, 130), Seguretat Social (TGSS, quota autònoms), comissió bancària (manteniment, targeta) o nòmina, NO el conciliïs amb factura: afegeix-lo a "classifications".
5. Respon exclusivament en format JSON vàlid que segueixi aquest esquema:
{
  "matches": [
    {
      "transactionId": "id del moviment",
      "invoiceId": "id de la factura",
      "confidence": 0.95,
      "reason": "Explicació breu i clara en català de per què coincideixen (ex: El concepte AMZN MKTP de -45,99 € correspon a la factura d'Amazon Web Services)"
    }
  ],
  "classifications": [
    {
      "transactionId": "id del moviment",
      "suggestedType": "BANK_FEE" | "TAX" | "PAYROLL" | "SOCIAL_SECURITY" | "OTHER",
      "reason": "Explicació breu en català (ex: Comissió de manteniment bancari, no requereix factura)"
    }
  ]
}`;
}

async function callGemini(apiKey: string, prompt: string, preferredModel?: string | null): Promise<string | null> {
  const models = preferredModel && preferredModel.startsWith("gemini")
    ? [preferredModel, ...GEMINI_MODELS.filter((m) => m !== preferredModel)]
    : GEMINI_MODELS;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      });

      if (!res.ok) {
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text.replace(/```json/gi, "").replace(/```/g, "").trim();
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function callOpenAi(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });
    return completion.choices[0]?.message.content ?? null;
  } catch {
    return null;
  }
}

function parseAiResponse(
  rawJson: string,
  transactions: Array<{ id: string }>,
  invoices: Array<{ id: string }>,
): AiReconcileResult {
  try {
    const parsed = JSON.parse(rawJson) as {
      matches?: Array<{
        transactionId?: unknown;
        invoiceId?: unknown;
        confidence?: unknown;
        reason?: unknown;
      }>;
      classifications?: Array<{
        transactionId?: unknown;
        suggestedType?: unknown;
        reason?: unknown;
      }>;
    };

    const validTxIds = new Set(transactions.map((t) => t.id));
    const validInvIds = new Set(invoices.map((inv) => inv.id));

    const aiMatches: AiMatchProposal[] = [];
    const usedTxs = new Set<string>();
    const usedInvs = new Set<string>();

    if (Array.isArray(parsed.matches)) {
      for (const item of parsed.matches) {
        const txId = typeof item.transactionId === "string" ? item.transactionId : "";
        const invId = typeof item.invoiceId === "string" ? item.invoiceId : "";
        const confNum = typeof item.confidence === "number" ? item.confidence : 0.85;
        const reason = typeof item.reason === "string" ? item.reason : "Coincidència detectada per IA";

        if (validTxIds.has(txId) && validInvIds.has(invId) && !usedTxs.has(txId) && !usedInvs.has(invId)) {
          usedTxs.add(txId);
          usedInvs.add(invId);
          aiMatches.push({
            transactionId: txId,
            invoiceId: invId,
            confidenceScore: confNum.toFixed(4),
            reason,
          });
        }
      }
    }

    const classifications: AiClassification[] = [];
    if (Array.isArray(parsed.classifications)) {
      for (const item of parsed.classifications) {
        const txId = typeof item.transactionId === "string" ? item.transactionId : "";
        const type = typeof item.suggestedType === "string" ? item.suggestedType : "OTHER";
        const reason = typeof item.reason === "string" ? item.reason : "Despesa directa";

        if (validTxIds.has(txId) && !usedTxs.has(txId)) {
          classifications.push({
            transactionId: txId,
            suggestedType: isValidType(type) ? type : "OTHER",
            reason,
          });
        }
      }
    }

    return { aiMatches, classifications };
  } catch {
    return { aiMatches: [], classifications: [] };
  }
}

function isValidType(val: string): val is AiClassification["suggestedType"] {
  return ["BANK_FEE", "TAX", "PAYROLL", "SOCIAL_SECURITY", "OTHER"].includes(val);
}
