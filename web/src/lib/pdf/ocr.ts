import type { PDFPageProxy } from "./extractText";
import workerUrl from "tesseract.js/dist/worker.min.js?url";
import coreUrl from "tesseract.js-core/tesseract-core-simd.wasm.js?url";

const LANG_URL = "https://tessdata.projectnaptha.com/4.0.0_fast";

async function renderPageToCanvas(page: PDFPageProxy, scale = 2): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CanvasContext nicht verfügbar");
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

export async function ocrPdf(pages: PDFPageProxy[]): Promise<{ text: string; warnings: string[] }> {
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker({
    workerPath: workerUrl,
    corePath: coreUrl,
    langPath: LANG_URL,
    logger: () => {},
  });

  try {
    await worker.loadLanguage("deu+eng");
    await worker.initialize("deu+eng");

    const texts: string[] = [];
    for (const page of pages) {
      const canvas = await renderPageToCanvas(page, 2);
      const { data } = await worker.recognize(canvas);
      if (data?.text) texts.push(data.text);
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
      await page.cleanup();
    }
    return { text: texts.join("\n"), warnings: [] };
  } catch (error) {
    return { text: "", warnings: [`OCR fehlgeschlagen: ${(error as Error).message}`] };
  } finally {
    await worker.terminate();
  }
}
