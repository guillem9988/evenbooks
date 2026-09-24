import { createWorker } from "tesseract.js";
import { renderPageAsImage } from "unpdf";

export async function recognizeImage(bytes: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(bytes);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

export async function renderPdfPage(bytes: Buffer): Promise<Buffer> {
  const image = await renderPageAsImage(new Uint8Array(bytes), 1, { scale: 2 });
  return Buffer.from(image);
}
