import {
  ALLOWED_UOMS,
  defaultTaxRate,
  guessLineType,
  normaliseNumber,
  toAllowedUom,
  toIsoDate,
  withValidation,
} from "../utils";
import type { InvoiceDraft, InvoiceLineDraft } from "../types";

const VERSION = "2024-11-15";

const HEADER_PATTERNS = {
  invoiceNo: /(?:Invoice\s*(?:No\.?|Number)|Rechnungsnummer|Belegnr\.)[:#]?\s*([A-Z0-9\-]+)/i,
  invoiceDate: /(?:Invoice Date|Datum|Belegdatum)[:#]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
  gross: /(?:Gesamtbetrag|Bruttobetrag|Total Due)[:#]?\s*([0-9.]+,[0-9]{2})/i,
};

const TABLE_HEADER_REGEX = /(Pos(?:ition)?|Pos\.)\s+Art(?:ikel)?-?Nr\.?/i;
const UOM_HINTS = new Set<string>([...ALLOWED_UOMS, "ST", "STK", "STUEK", "STCK", "CT", "CTN", "BOX", "PKG"]);

function cleanToken(token: string): string {
  const trimmed = token.replace(/[\s\u00A0]+/g, " ").trim();
  if (!trimmed) return "";
  if (/^-?\d+(?:[.,]\d+)?%?$/.test(trimmed)) return trimmed;
  return trimmed.replace(/[.,;:]+$/g, "");
}

function normaliseUomValue(token: string): string {
  return token
    .replace(/[.,;:]/g, "")
    .replace(/Ä/g, "AE")
    .replace(/ä/g, "ae")
    .replace(/Ö/g, "OE")
    .replace(/ö/g, "oe")
    .replace(/Ü/g, "UE")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function isUomToken(token: string): boolean {
  const cleaned = normaliseUomValue(token).toUpperCase();
  if (!cleaned) return false;
  if (UOM_HINTS.has(cleaned)) return true;
  return cleaned.length <= 4 && /^[A-Z]+$/.test(cleaned);
}

function dropTrailing(tokens: string[], predicate: (token: string) => boolean): void {
  while (tokens.length > 0 && predicate(tokens[tokens.length - 1])) {
    tokens.pop();
  }
}

function takeTrailingNumber(tokens: string[]): string | null {
  for (let idx = tokens.length - 1; idx >= 0; idx -= 1) {
    const token = tokens[idx];
    const normalised = token.replace(/[€$]/g, "");
    if (/^-?\d+(?:[.,]\d+)?$/.test(normalised)) {
      tokens.splice(idx, 1);
      return normalised;
    }
    if (/^-?\d+(?:[.,]\d+)?%$/.test(normalised) || /^(?:EUR|EURO|€)$/i.test(normalised)) {
      tokens.splice(idx, 1);
    }
  }
  return null;
}

function takeTrailingTax(tokens: string[]): string | null {
  for (let idx = tokens.length - 1; idx >= 0; idx -= 1) {
    const token = tokens[idx];
    if (/^-?\d+(?:[.,]\d+)?%$/.test(token)) {
      tokens.splice(idx, 1);
      return token;
    }
    if (/^(?:VAT|BTW)$/i.test(token) || token === "%") {
      tokens.splice(idx, 1);
    }
  }
  return null;
}

function takeTrailingUom(tokens: string[]): string | null {
  for (let idx = tokens.length - 1; idx >= 0; idx -= 1) {
    const token = tokens[idx];
    if (isUomToken(token)) {
      tokens.splice(idx, 1);
      return normaliseUomValue(token);
    }
    if (/^(?:per|pro)$/i.test(token) || token === "/") {
      tokens.splice(idx, 1);
    }
  }
  return null;
}

function trimTrailingListPrice(tokens: string[]): void {
  while (tokens.length >= 3) {
    const last = tokens[tokens.length - 1];
    const middle = tokens[tokens.length - 2];
    const first = tokens[tokens.length - 3];

    if (
      isUomToken(last) &&
      /^(?:per|pro)$/i.test(middle) &&
      /^\d+(?:[.,]\d+)?$/.test(first)
    ) {
      tokens.splice(tokens.length - 3, 3);
      continue;
    }

    if (
      isUomToken(last) &&
      middle === "/" &&
      /^\d+(?:[.,]\d+)?$/.test(first)
    ) {
      tokens.splice(tokens.length - 3, 3);
      continue;
    }

    if (
      tokens.length >= 4 &&
      isUomToken(last) &&
      middle === "/" &&
      /^(?:EUR|EURO|€)$/i.test(first) &&
      /^\d+(?:[.,]\d+)?$/.test(tokens[tokens.length - 4])
    ) {
      tokens.splice(tokens.length - 4, 4);
      continue;
    }

    break;
  }

  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (/^\d+(?:[.,]\d+)?\/[A-Za-zÄÖÜß]{1,10}$/i.test(last)) {
      tokens.pop();
      continue;
    }
    break;
  }
}

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

function buildLine(raw: string, lineNo: number): InvoiceLineDraft | null {
  const tokens = raw
    .replace(/[\u00A0]/g, " ")
    .split(/\s+/)
    .map(cleanToken)
    .filter(Boolean);

  if (tokens.length < 5) return null;

  const posToken = tokens.shift() ?? "";
  const pos = Number.parseInt(posToken, 10);
  if (Number.isNaN(pos)) return null;

  const sku = tokens.shift() ?? "";

  const working = [...tokens];

  dropTrailing(working, (token) => !token || token === "-" || token === "—");

  const lineTotalRaw = takeTrailingNumber(working);
  if (!lineTotalRaw) return null;
  const lineTotal = normaliseNumber(lineTotalRaw, 2);

  const taxRaw = takeTrailingTax(working);

  dropTrailing(working, (token) => /^(?:EUR|EURO|€)$/i.test(token));

  const unitPriceRaw = takeTrailingNumber(working);
  if (!unitPriceRaw) return null;
  const unitPrice = normaliseNumber(unitPriceRaw);

  dropTrailing(working, (token) =>
    token === "/" || /^(?:EUR|EURO|€|per|pro)$/i.test(token),
  );

  const uomRaw = takeTrailingUom(working);
  if (!uomRaw) return null;
  const { uom, warning } = toAllowedUom(uomRaw);
  if (!uom) return null;

  const qtyRaw = takeTrailingNumber(working);
  if (!qtyRaw) return null;
  const qty = normaliseNumber(qtyRaw);

  trimTrailingListPrice(working);
  dropTrailing(working, (token) => /^(?:EUR|EURO|€)$/i.test(token));

  const name = working.join(" ").replace(/\s+/g, " ");
  const lineType = guessLineType(name);
  const taxRate = taxRaw ? normaliseNumber(taxRaw.replace(/%/g, ""), 2) : defaultTaxRate(lineType);

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
    const trimmed = line.trim();
    if (/^\d+\s/.test(trimmed)) {
      if (buffer) {
        const parsed = buildLine(buffer, lineNo);
        if (parsed) {
          records.push(parsed);
          lineNo += 1;
        }
      }
      buffer = trimmed;
    } else if (buffer) {
      buffer = `${buffer} ${trimmed}`;
    }
  }

  if (buffer) {
    const parsed = buildLine(buffer, lineNo);
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
