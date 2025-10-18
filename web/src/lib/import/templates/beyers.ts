import { defaultTaxRate, guessLineType, normaliseNumber, toAllowedUom, toIsoDate, withValidation } from "../utils";
import type { InvoiceDraft, InvoiceLineDraft } from "../types";

const VERSION = "2024-11-15";

const HEADER_PATTERNS = {
  invoiceNo: /(?:Invoice\s*(?:No\.?|Number)|Rechnungsnummer|Belegnr\.)[:#]?\s*([A-Z0-9\-]+)/i,
  invoiceDate: /(?:Invoice Date|Datum|Belegdatum)[:#]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
  gross: /(?:Gesamtbetrag|Bruttobetrag|Total Due)[:#]?\s*([0-9.]+,[0-9]{2})/i,
};

const TABLE_HEADER_REGEX = /(Pos(?:ition)?|Pos\.)\s+Art(?:ikel)?-?Nr\.?/i;

function sanitiseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u00A0]/g, " ").trim())
    .filter((line) => line.length > 0);
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

function sliceTable(lines: string[]): string[] {
  const start = lines.findIndex((line) => TABLE_HEADER_REGEX.test(line));
  if (start === -1) return [];
  const body = lines.slice(start + 1);
  const endIdx = body.findIndex((line) => /(?:Zwischensumme|Subtotal|Nettobetrag|Brutto)/i.test(line));
  return endIdx === -1 ? body : body.slice(0, endIdx);
}

function buildLine(columns: string[], raw: string, lineNo: number): InvoiceLineDraft | null {
  if (columns.length < 6) return null;

  const pos = Number.parseInt(columns[0], 10);
  if (Number.isNaN(pos)) return null;

  const sku = columns[1];
  const qtyRaw = columns[columns.length - 4];
  const uomRaw = columns[columns.length - 3];
  const unitPriceRaw = columns[columns.length - 2];
  const lineTotalRaw = columns[columns.length - 1];
  const nameParts = columns.slice(2, columns.length - 4);

  const name = nameParts.join(" ").replace(/\s+/g, " ");
  const qty = normaliseNumber(qtyRaw);
  const { uom, warning } = toAllowedUom(uomRaw);
  if (!uom) return null;
  const unitPrice = normaliseNumber(unitPriceRaw);
  const lineTotal = normaliseNumber(lineTotalRaw, 2);
  const lineType = guessLineType(name);
  const taxRate = defaultTaxRate(lineType);

  const issues: string[] = [];
  if (warning) {
    issues.push(warning);
  }

  const confidenceBase = sku ? 0.92 : 0.8;

  return {
    line_no: Number.isNaN(pos) ? lineNo : pos,
    line_type: lineType,
    product_sku: sku || undefined,
    product_name: name || undefined,
    qty,
    uom,
    unit_price_net: unitPrice,
    tax_rate_percent: taxRate,
    line_total_net: lineTotal,
    confidence: confidenceBase,
    issues,
    source: { raw },
  } satisfies InvoiceLineDraft;
}

function collectTableLines(lines: string[]): InvoiceLineDraft[] {
  const records: InvoiceLineDraft[] = [];
  let buffer: string | null = null;
  let lineNo = 1;

  for (const line of lines) {
    const collapsed = line.replace(/\s{2,}/g, "\t");
    const parts = collapsed.split("\t").map((part) => part.trim()).filter(Boolean);

    if (/^\d+\s/.test(line) && parts.length >= 6) {
      if (buffer) buffer = `${buffer} ${line}`;
      else buffer = line;
    } else if (buffer) {
      buffer = `${buffer} ${line}`;
    } else {
      continue;
    }

    const bufferParts = buffer.replace(/\s{2,}/g, "\t").split("\t").map((p) => p.trim()).filter(Boolean);
    const parsed = buildLine(bufferParts, buffer, lineNo);
    if (parsed) {
      records.push(parsed);
      buffer = null;
      lineNo += 1;
    }
  }

  if (buffer) {
    const bufferParts = buffer.replace(/\s{2,}/g, "\t").split("\t").map((p) => p.trim()).filter(Boolean);
    const parsed = buildLine(bufferParts, buffer, lineNo);
    if (parsed) records.push(parsed);
  }

  return records;
}

export function parseBeyersTemplate(text: string, supplier: string): InvoiceDraft {
  const header = parseHeader(text);
  const lines = sanitiseLines(text);
  const tableLines = sliceTable(lines);
  const items = collectTableLines(tableLines);

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
      template: "Beyers PDF",
      version: VERSION,
      usedOcr: false,
      warnings: [],
    },
    meta: [],
    warnings,
    errors: [],
    items,
  };

  return withValidation(draft);
}
