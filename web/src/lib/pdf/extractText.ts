export type TextContentItem = { str?: string };
export type TextContent = { items: TextContentItem[] };

export type PDFPageProxy = {
  getTextContent(): Promise<TextContent>;
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
      if (moduleWithDefault.default?.getDocument) {
        return moduleWithDefault.default;
      }

      const { getDocument, GlobalWorkerOptions } = pdfModule as PdfJsModule;
      return { getDocument, GlobalWorkerOptions };
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
  return content.items
    .map((item) => item.str ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdfText> {
  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({ data, disableWorker: true });
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
