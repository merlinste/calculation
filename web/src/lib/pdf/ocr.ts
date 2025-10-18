import type { PDFPageProxy } from "./extractText";

const TESSERACT_VERSION = "5.1.0";
const WORKER_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`;
const CORE_URL = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}/tesseract-core-simd.wasm.js`;

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
  const { createWorker } = await import(
    /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.esm.min.js`
  );

  const worker = await createWorker({
    workerPath: WORKER_URL,
    corePath: CORE_URL,
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
