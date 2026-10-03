import { extractText } from "unpdf";
import { parseBankAmount, StatementFileError, type ParsedBankTransaction } from "./parse-csv.js";

export class PdfStatementError extends StatementFileError {
  constructor(message: string) {
    super(message);
    this.name = "PdfStatementError";
  }
}

const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

export interface ParsePdfOptions {
  apiKey?: string | null;
  model?: string | null;
}

export async function parseBankPdf(
  bytes: Buffer,
  options?: ParsePdfOptions,
): Promise<ParsedBankTransaction[]> {
  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY || null;

  if (apiKey) {
    try {
      const transactions = await parseBankPdfWithGemini(bytes, apiKey, options?.model);
      if (transactions.length > 0) {
        return transactions;
      }
    } catch (err) {
      // If Gemini fails, we will try text extraction fallback below
      console.warn("Gemini PDF statement extraction failed, trying text extraction fallback:", err);
    }
  }

  // Fallback: extract text with unpdf
  try {
    const extracted = await extractText(new Uint8Array(bytes));
    const fullText = Array.isArray(extracted.text)
      ? extracted.text.join("\n")
      : typeof extracted.text === "string"
        ? extracted.text
        : "";
    if (fullText.trim().length > 50) {
      const fromText = parseTextLinesToTransactions(fullText);
      if (fromText.length > 0) {
        return fromText;
      }
    }
  } catch {
    // Ignore fallback error
  }

  if (!apiKey) {
    throw new PdfStatementError(
      "Per analitzar extractes bancaris en PDF cal configurar una clau de Gemini a Configuració.",
    );
  }

  throw new PdfStatementError("No s'han pogut extreure moviments d'aquest extracte en PDF.");
}

async function parseBankPdfWithGemini(
  bytes: Buffer,
  apiKey: string,
  preferredModel?: string | null,
): Promise<ParsedBankTransaction[]> {
  const models = preferredModel && preferredModel.startsWith("gemini")
    ? [preferredModel, ...GEMINI_MODELS.filter((m) => m !== preferredModel)]
    : GEMINI_MODELS;

  const base64Data = bytes.toString("base64");
  const prompt = `Ets un expert comptable i fiscal especialitzat en extractes bancaris espanyols (CaixaBank, BBVA, Santander, Banc Sabadell, Bankinter, Openbank, N26, Revolut, Ibercaja, etc.).
Analitza aquest document PDF d'extracte bancari i extreu TOTS els moviments de la taula de transaccions.

PER A CADA MOVIMENT:
- transaction_date: data de l'operació en format YYYY-MM-DD.
- value_date: data valor en format YYYY-MM-DD (o la mateixa que transaction_date si no s'indica).
- amount: número decimal en euros amb signe negatiu si és un càrrec, despesa o sortida de diners (ex: -54.20), o positiu si és un ingrés, abono o entrada de diners (ex: 350.00). Si la taula té columnes separades de 'Debe / Cargo' i 'Haber / Abono', el 'Debe / Cargo' és SEMPRE negatiu (-) i el 'Haber / Abono' és positiu (+).
- description: concepte o descripció completa del moviment (sense retallar).

Retorna ÚNICAMENT un objecte JSON amb aquest format exacte:
{
  "transactions": [
    {
      "transaction_date": "2026-03-15",
      "value_date": "2026-03-15",
      "amount": "-54.20",
      "description": "PAGAMENT RESTAURANT BCN"
    }
  ]
}`;

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: base64Data,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        lastError = new Error(`Gemini error ${res.status}: ${errorText}`);
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) continue;

      const cleanJson = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson) as {
        transactions?: Array<{
          transaction_date?: string;
          value_date?: string;
          amount?: string | number;
          description?: string;
        }>;
      };

      if (!Array.isArray(parsed.transactions) || parsed.transactions.length === 0) {
        continue;
      }

      const transactions: ParsedBankTransaction[] = [];
      for (const item of parsed.transactions) {
        const dateStr = item.transaction_date?.trim();
        const amountVal = item.amount;
        const desc = item.description?.trim() || "Moviment bancari";

        if (!dateStr || amountVal === undefined || amountVal === null) continue;

        const date = parseIsoDate(dateStr);
        if (date === null) continue;

        const valDate = item.value_date?.trim() ? parseIsoDate(item.value_date.trim()) ?? date : date;
        const amountCents = typeof amountVal === "number"
          ? BigInt(Math.round(amountVal * 100))
          : parseBankAmount(String(amountVal));

        transactions.push({
          transactionDate: date,
          valueDate: valDate,
          amountCents,
          rawDescription: desc,
        });
      }

      if (transactions.length > 0) {
        return transactions;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw lastError ?? new PdfStatementError("No s'han pogut extreure moviments amb Gemini.");
}

function parseIsoDate(value: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(date.getTime()) && date.getUTCDate() === day) {
      return date;
    }
  }
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(value);
  if (dmy) {
    const year = Number(dmy[3]);
    const month = Number(dmy[2]);
    const day = Number(dmy[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(date.getTime()) && date.getUTCDate() === day) {
      return date;
    }
  }
  return null;
}

function parseTextLinesToTransactions(text: string): ParsedBankTransaction[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const transactions: ParsedBankTransaction[] = [];
  // Pattern matching: e.g. "12/03/2026 Pago restaurante -45,00" or similar
  const lineRegex = /^(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+(.+?)\s+([+-]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*€?$/;

  for (const line of lines) {
    const match = lineRegex.exec(line);
    if (match && match[1] && match[2] && match[3]) {
      const date = parseIsoDate(match[1]);
      if (date) {
        try {
          const amountCents = parseBankAmount(match[3]);
          transactions.push({
            transactionDate: date,
            valueDate: date,
            amountCents,
            rawDescription: match[2].trim(),
          });
        } catch {
          // continue
        }
      }
    }
  }

  return transactions;
}
