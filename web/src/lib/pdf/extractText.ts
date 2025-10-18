import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy, type TextContent } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";

GlobalWorkerOptions.workerSrc = workerSrc;

export type ExtractedPdfText = {
  text: string;
  pageTexts: string[];
  document: PDFDocumentProxy;
  pages: PDFPageProxy[];
};

async function extractPageText(content: TextContent): Promise<string> {
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdfText> {
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
