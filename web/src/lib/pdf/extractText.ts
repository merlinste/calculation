import workerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";

export type TextContentItem = {
  str?: string;
  hasEOL?: boolean;
  width?: number;
  transform?: [number, number, number, number, number, number];
};
export type TextContent = { items: TextContentItem[] };

export type PDFPageProxy = {
  getTextContent(): Promise<TextContent>;
  cleanup(): void | Promise<void>;
};

export type PDFDocumentProxy = {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
};

type PdfJsImport = typeof import("pdfjs-dist");

type PdfJsModule = Pick<PdfJsImport, "getDocument" | "GlobalWorkerOptions">;

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist").then((pdfModule) => {
      const moduleWithDefault = pdfModule as { default?: PdfJsModule };
      const loadedModule =
        moduleWithDefault.default?.getDocument
          ? moduleWithDefault.default
          : (pdfModule as PdfJsModule);

      if (loadedModule.GlobalWorkerOptions) {
        loadedModule.GlobalWorkerOptions.workerSrc = workerSrc;
      }

      return loadedModule;
    });
  }
  return pdfJsModulePromise;
}

export type ExtractedPdfText = {
  text: string;
  pageTexts: string[];
  document: PDFDocumentProxy;
  pages: PDFPageProxy[];
};

async function extractPageText(content: TextContent): Promise<string> {
  const parts: string[] = [];
  let lastX: number | null = null;
  let lastWidth: number | null = null;

  for (const item of content.items) {
    const text = item.str ?? "";
    if (!text) continue;

    const currentX = item.transform?.[4] ?? null;
    const currentWidth = item.width ?? null;

    const shouldInsertLineBreakFromPosition =
      lastX !== null &&
      currentX !== null &&
      Math.abs(currentX - lastX) > 20 &&
      (currentX < lastX || (lastWidth !== null && currentX - lastX > lastWidth * 1.5));

    const previousPart = parts[parts.length - 1];
    const needsWhitespace =
      parts.length > 0 &&
      previousPart !== "\n" &&
      !previousPart?.endsWith(" ") &&
      !text.startsWith(" ") &&
      !text.startsWith("\t");

    if (shouldInsertLineBreakFromPosition && parts.length > 0 && previousPart !== "\n") {
      parts.push("\n");
    } else if (needsWhitespace) {
      parts.push(" ");
    }

    parts.push(text);

    if (item.hasEOL) {
      parts.push("\n");
      lastX = null;
      lastWidth = null;
    } else {
      lastX = currentX;
      lastWidth = currentWidth;
    }
  }

  return parts.join("").trim();
}

export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdfText> {
  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];
  const pages: PDFPageProxy[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = await extractPageText(textContent);
    if (pageText) pageTexts.push(pageText);
    pages.push(page);
  }

  return {
    text: pageTexts.join("\n"),
    pageTexts,
    document: pdf,
    pages,
  };
}
