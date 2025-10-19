import { extractPdfText } from "../pdf/extractText";
import { ocrPdf } from "../pdf/ocr";
import { mergeWarnings, withValidation, cloneDraft } from "./utils";
import type { InvoiceDraft, ParserFeedbackEntry } from "./types";
import { parseBeyersTemplate } from "./templates/beyers";
import { parseMeyerHornTemplate } from "./templates/meyerHorn";

export type ParsePdfOptions = {
  supplier: string;
  file: File;
  invoiceNoOverride?: string;
  invoiceDateOverride?: string;
  feedback?: ParserFeedbackEntry[];
};

const MIN_TEXT_LENGTH = 20;

function selectTemplate(
  text: string,
  supplier: string,
  feedback?: ParserFeedbackEntry[],
): InvoiceDraft {
  const supplierLower = supplier.toLowerCase();
  if (supplierLower.includes("beyers")) return parseBeyersTemplate(text, supplier);
  if (supplierLower.includes("meyer") || supplierLower.includes("horn")) {
    return parseMeyerHornTemplate(text, supplier, feedback);
  }
  const fallback = parseBeyersTemplate(text, supplier);
  fallback.warnings.push("Lieferant unbekannt – Beyers-Template als Fallback verwendet.");
  return fallback;
}

export async function parsePdfInvoice(options: ParsePdfOptions): Promise<InvoiceDraft> {
  const { file, supplier, invoiceDateOverride, invoiceNoOverride, feedback } = options;
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const extraction = await extractPdfText(data);
  let { text } = extraction;
  const extractionWarnings: string[] = [];
  let usedOcr = false;

  if (!text || text.replace(/\s+/g, "").length < MIN_TEXT_LENGTH) {
    const ocrResult = await ocrPdf(extraction.pages);
    if (ocrResult.text.replace(/\s+/g, "").length >= MIN_TEXT_LENGTH) {
      text = ocrResult.text;
      usedOcr = true;
      extractionWarnings.push(...ocrResult.warnings);
    } else {
      extractionWarnings.push(...ocrResult.warnings, "OCR konnte keinen verwertbaren Text extrahieren.");
      text = ocrResult.text;
    }
  } else {
    for (const page of extraction.pages) {
      await page.cleanup();
    }
  }

  await extraction.document.destroy();

  if (!text || text.replace(/\s+/g, "").length < MIN_TEXT_LENGTH) {
    extractionWarnings.push("PDF enthält keinen lesbaren Text");
  }

  const draft = selectTemplate(text, supplier, feedback);
  draft.parser.usedOcr = usedOcr;
  draft.parser.warnings = mergeWarnings(draft.parser.warnings, extractionWarnings);
  if (invoiceNoOverride) draft.invoice_no = invoiceNoOverride;
  if (invoiceDateOverride) draft.invoice_date = invoiceDateOverride;

  const validated = withValidation(draft);
  validated.parser.warnings = mergeWarnings(validated.parser.warnings, extractionWarnings);
  if (usedOcr && !validated.parser.warnings.includes("OCR verwendet")) {
    validated.parser.warnings.push("OCR verwendet");
  }

  return cloneDraft(validated);
}
