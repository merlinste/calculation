import { defaultTaxRate, guessLineType, normaliseNumber, toAllowedUom, toIsoDate, withValidation } from "../utils";
import type { InvoiceDraft, InvoiceLineDraft } from "../types";

const VERSION = "2024-11-15";

const HEADER_PATTERNS = {
  invoiceNo: /(?:Rechnung|Invoice)\s*(?:Nr\.|No\.|Number)?\s*[:#]?\s*([A-Z0-9\-]+)/i,
  invoiceDate: /(?:Rechnungsdatum|Invoice Date)[:#]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
  gross: /(?:Bruttosumme|Gesamtbetrag|Total Due)[:#]?\s*([0-9.]+,[0-9]{2})/i,
};

const TABLE_HEADER_REGEX = /Pos\.?\s+Artikel|Art\.?\s*Nr\.?/i;

function cleanText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u00A0]/g, " ").trim())
    .filter(Boolean);
}

function parseHeader(text: string) {
  const invoiceNo = text.match(HEADER_PATTERNS.invoiceNo)?.[1] ?? "";
  const invoiceDateRaw = text.match(HEADER_PATTERNS.invoiceDate)?.[1] ?? "";
  const grossRaw = text.match(HEADER_PATTERNS.gross)?.[1] ?? "";
  return {
    invoiceNo,
    invoiceDate: toIsoDate(invoiceDateRaw),
    gross: normaliseNumber(grossRaw, 2),
  };
}

function extractTable(lines: string[]): string[] {
  const start = lines.findIndex((line) => TABLE_HEADER_REGEX.test(line));
  if (start === -1) return [];
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => /(?:Summe|Total|Rechnungsbetrag)/i.test(line));
  return end === -1 ? body : body.slice(0, end);
}

function parseLine(bufferParts: string[], raw: string, fallbackLineNo: number): InvoiceLineDraft | null {
  if (bufferParts.length < 6) return null;
  const pos = Number.parseInt(bufferParts[0], 10);
  const sku = bufferParts[1];
  const qtyRaw = bufferParts[bufferParts.length - 4];
  const uomRaw = bufferParts[bufferParts.length - 3];
  const unitPriceRaw = bufferParts[bufferParts.length - 2];
  const lineTotalRaw = bufferParts[bufferParts.length - 1];
  const name = bufferParts.slice(2, bufferParts.length - 4).join(" ");

  const qty = normaliseNumber(qtyRaw);
  const { uom, warning } = toAllowedUom(uomRaw);
  if (!uom) return null;
  const unitPrice = normaliseNumber(unitPriceRaw);
  const lineTotal = normaliseNumber(lineTotalRaw, 2);
  const lineType = guessLineType(name);
  const taxRate = lineType === "shipping" ? 19 : defaultTaxRate(lineType);

  const issues: string[] = [];
  if (warning) issues.push(warning);

  let confidence = sku ? 0.9 : 0.75;
  if (issues.length) confidence = Math.min(confidence, 0.7);

  return {
    line_no: Number.isNaN(pos) ? fallbackLineNo : pos,
    line_type: lineType,
    product_sku: sku || undefined,
    product_name: name || undefined,
    qty,
    uom,
    unit_price_net: unitPrice,
    tax_rate_percent: taxRate,
    line_total_net: lineTotal,
    confidence,
    issues,
    source: { raw },
  } satisfies InvoiceLineDraft;
}

function collect(lines: string[]): InvoiceLineDraft[] {
  const items: InvoiceLineDraft[] = [];
  let buffer: string | null = null;
  let fallbackLineNo = 1;

  for (const line of lines) {
    const current = line.replace(/\s{2,}/g, "\t");
    const parts = current.split("\t").map((part) => part.trim()).filter(Boolean);

    if (/^\d+\s/.test(line) && parts.length >= 6) {
      buffer = line;
    } else if (buffer) {
      buffer = `${buffer} ${line}`;
    } else {
      continue;
    }

    const combinedParts = buffer
      .replace(/\s{2,}/g, "\t")
      .split("\t")
      .map((part) => part.trim())
      .filter(Boolean);

    const parsed = parseLine(combinedParts, buffer, fallbackLineNo);
    if (parsed) {
      items.push(parsed);
      buffer = null;
      fallbackLineNo += 1;
    }
  }

  if (buffer) {
    const combinedParts = buffer
      .replace(/\s{2,}/g, "\t")
      .split("\t")
      .map((part) => part.trim())
      .filter(Boolean);
    const parsed = parseLine(combinedParts, buffer, fallbackLineNo);
    if (parsed) items.push(parsed);
  }

  return items;
}

export function parseMeyerHornTemplate(text: string, supplier: string): InvoiceDraft {
  const header = parseHeader(text);
  const lines = cleanText(text);
  const table = extractTable(lines);
  const items = collect(table);

  const warnings = items.length === 0 ? ["Keine Positionen erkannt"] : [];

  const draft: InvoiceDraft = {
    supplier,
    invoice_no: header.invoiceNo || "",
    invoice_date: header.invoiceDate || "",
    currency: "EUR",
    totals: {
      net: 0,
      tax: 0,
      gross: 0,
      reportedGross: header.gross || null,
      variancePercent: null,
    },
    parser: {
      template: "Meyer & Horn PDF",
      version: VERSION,
      usedOcr: false,
      warnings: [],
    },
    warnings,
    errors: [],
    items,
  };

  return withValidation(draft);
}
