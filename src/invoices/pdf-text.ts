import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(bytes: Buffer): Promise<string> {
  try {
    const document = await getDocumentProxy(new Uint8Array(bytes));
    const extracted = await extractText(document, { mergePages: true });
    return Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
  } catch {
    return "";
  }
}
