const PDFJS_VERSION = "3.11.174";
const PDFJS_BASE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;

export type TextContentItem = { str?: string };
export type TextContent = { items: TextContentItem[] };

export type PDFPageProxy = {
  getTextContent(): Promise<TextContent>;
};

export type PDFDocumentProxy = {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
};

type DocumentLoadTask = {
  promise: Promise<PDFDocumentProxy>;
};

type PdfJsModule = {
  getDocument(config: { data: Uint8Array }): DocumentLoadTask;
  GlobalWorkerOptions: { workerSrc: string };
};

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import(
      /* @vite-ignore */ `${PDFJS_BASE_URL}/pdf.min.mjs`
    ).then((module) => {
      const pdfjs = (module as PdfJsModule | { default: PdfJsModule }).default ?? (module as PdfJsModule);
      pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE_URL}/pdf.worker.min.js`;
      return pdfjs;
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
