import {
  defaultTaxRate,
  guessLineType,
  normaliseNumber,
  toAllowedUom,
  toIsoDate,
  withValidation,
} from "../utils";
import type {
  InvoiceDraft,
  InvoiceLineDraft,
  InvoiceMetaField,
  ParserFeedbackEntry,
} from "../types";

const VERSION = "2024-11-15";

const HEADER_PATTERNS = {
  invoiceNo: /(?:Rechnung|Invoice)\s*(?:Nr\.|No\.|Number)?\s*[:#]?\s*([A-Z0-9\-]+)/i,
  invoiceDate: /(?:Rechnungsdatum|Invoice Date)[:#]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
  gross: /(?:Bruttosumme|Gesamtbetrag|Total Due)[:#]?\s*([0-9.]+,[0-9]{2})/i,
};

const META_PATTERNS: Array<{
  key: string;
  label: string;
  regex: RegExp;
  transform?: (value: string) => string;
}> = [
  { key: "customer_no", label: "Kunden-Nr.", regex: /Kunden-?Nr\.?[:#]?\s*([A-Z0-9\-\/]+)/i },
  { key: "order_no", label: "Bestellung", regex: /Bestellung[:#]?\s*([A-Z0-9\-\/]+)/i },
  {
    key: "delivery_note",
    label: "Lieferschein",
    regex: /Lieferschein(?:nr\.|nummer)?[:#]?\s*([A-Z0-9\-\/]+)/i,
  },
  {
    key: "delivery_date",
    label: "Lieferdatum",
    regex: /Lieferdatum[:#]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
    transform: toIsoDate,
  },
  {
    key: "debtor_no",
    label: "Debitorennr.",
    regex: /Debitorennr\.?[:#]?\s*([A-Z0-9\-\/]+)/i,
  },
];

const TABLE_HEADER_REGEX = /Pos\.?\s+Artikel|Art\.?\s*Nr\.?/i;

function cleanText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[\u00A0]/g, " ")
        .replace(/\t+/g, "\t")
        .trim()
    )
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

function parseMeta(text: string): InvoiceMetaField[] {
  const meta: InvoiceMetaField[] = [];
  for (const field of META_PATTERNS) {
    const match = text.match(field.regex);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const value = field.transform ? field.transform(raw) : raw;
    meta.push({ key: field.key, label: field.label, value });
  }
  return meta;
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
    const current = line.replace(/\t+/g, "\t").replace(/\s{2,}/g, "\t");
    const parts = current.split("\t").map((part) => part.trim()).filter(Boolean);

    if (/^\d+\s/.test(line) && parts.length >= 6) {
      buffer = line;
    } else if (buffer) {
      buffer = `${buffer} ${line}`;
    } else {
      continue;
    }

    const combinedParts = buffer
      .replace(/\t+/g, "\t")
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
      .replace(/\t+/g, "\t")
      .replace(/\s{2,}/g, "\t")
      .split("\t")
      .map((part) => part.trim())
      .filter(Boolean);
    const parsed = parseLine(combinedParts, buffer, fallbackLineNo);
    if (parsed) items.push(parsed);
  }

  return items;
}

function normaliseDescription(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normaliseSku(value: string | undefined | null): string {
  return value ? value.trim().toLowerCase() : "";
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const matrix: number[][] = Array.from({ length: aLen + 1 }, () => new Array<number>(bLen + 1).fill(0));
  for (let i = 0; i <= aLen; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= bLen; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= aLen; i += 1) {
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[aLen][bLen];
}

type FeedbackLookup = {
  byCombined: Map<string, ParserFeedbackEntry[]>;
  byDescription: Map<string, ParserFeedbackEntry[]>;
  entries: ParserFeedbackEntry[];
};

function buildFeedbackLookup(feedback: ParserFeedbackEntry[] | undefined): FeedbackLookup {
  const byCombined = new Map<string, ParserFeedbackEntry[]>();
  const byDescription = new Map<string, ParserFeedbackEntry[]>();
  const entries: ParserFeedbackEntry[] = [];

  for (const entry of feedback ?? []) {
    const descKey = normaliseDescription(entry.detected_description);
    if (!descKey) continue;
    const skuKey = normaliseSku(entry.detected_sku);
    const combinedKey = `${descKey}__${skuKey}`;

    if (!byCombined.has(combinedKey)) byCombined.set(combinedKey, []);
    byCombined.get(combinedKey)!.push(entry);

    if (!byDescription.has(descKey)) byDescription.set(descKey, []);
    byDescription.get(descKey)!.push(entry);

    entries.push(entry);
  }

  return { byCombined, byDescription, entries };
}

function pickPreferredEntry(entries: ParserFeedbackEntry[] | undefined): ParserFeedbackEntry | null {
  if (!entries?.length) return null;
  return entries.reduce<ParserFeedbackEntry | null>((best, entry) => {
    if (!best) return entry;
    const bestHasProduct = best.assigned_product_id != null;
    const entryHasProduct = entry.assigned_product_id != null;
    if (bestHasProduct !== entryHasProduct) {
      return entryHasProduct ? entry : best;
    }
    const bestTs = best.updated_at ? Date.parse(best.updated_at) : 0;
    const entryTs = entry.updated_at ? Date.parse(entry.updated_at) : 0;
    return entryTs > bestTs ? entry : best;
  }, null);
}

type FeedbackMatch = {
  entry: ParserFeedbackEntry;
  strategy: "combined" | "description" | "fuzzy";
};

function findFeedbackMatch(
  line: InvoiceLineDraft,
  lookup: FeedbackLookup,
): FeedbackMatch | null {
  if (lookup.entries.length === 0) return null;
  const sourceKey = normaliseDescription(line.source?.raw);
  const nameKey = normaliseDescription(line.product_name);
  const skuKey = normaliseSku(line.product_sku);

  const candidateKeys = [sourceKey, nameKey].filter(Boolean);

  for (const key of candidateKeys) {
    const match = pickPreferredEntry(lookup.byCombined.get(`${key}__${skuKey}`));
    if (match) return { entry: match, strategy: "combined" };
  }

  for (const key of candidateKeys) {
    const match = pickPreferredEntry(lookup.byDescription.get(key));
    if (match) return { entry: match, strategy: "description" };
  }

  if (!candidateKeys.length) return null;

  let best: { entry: ParserFeedbackEntry; distance: number } | null = null;
  for (const entry of lookup.entries) {
    const entryKey = normaliseDescription(entry.detected_description);
    if (!entryKey) continue;
    for (const key of candidateKeys) {
      const distance = levenshteinDistance(key, entryKey);
      const threshold = Math.max(2, Math.floor(Math.max(key.length, entryKey.length) * 0.2));
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { entry, distance };
      }
    }
  }

  if (!best) return null;
  return { entry: best.entry, strategy: "fuzzy" };
}

function applyFeedback(
  baseItems: InvoiceLineDraft[],
  feedback: ParserFeedbackEntry[] | undefined,
): { items: InvoiceLineDraft[]; warnings: string[] } {
  if (!feedback?.length) return { items: baseItems, warnings: [] };

  const lookup = buildFeedbackLookup(feedback);
  let applied = 0;
  let fuzzyMatches = 0;

  const items = baseItems.map((item) => {
    if (item.line_type !== "product" || item.product_sku) return item;
    const match = findFeedbackMatch(item, lookup);
    if (!match) return item;

    applied += 1;
    if (match.strategy === "fuzzy") fuzzyMatches += 1;

    const updated: InvoiceLineDraft = {
      ...item,
      confidence: Math.max(item.confidence, match.strategy === "fuzzy" ? 0.9 : 0.96),
      issues: Array.from(new Set([...item.issues, "manuell zugeordnet"])),
    };

    if (match.strategy === "fuzzy") {
      updated.issues = Array.from(new Set([...updated.issues, "unscharfer Abgleich"]));
    }

    if (match.entry.assigned_product_id != null) {
      updated.product_id = match.entry.assigned_product_id;
    }
    if (match.entry.assigned_product_sku) {
      updated.product_sku = match.entry.assigned_product_sku;
    }
    if (match.entry.assigned_product_name) {
      updated.product_name = match.entry.assigned_product_name;
    }
    if (match.entry.assigned_uom) {
      updated.uom = match.entry.assigned_uom;
    }

    return updated;
  });

  const warnings: string[] = [];
  if (applied > 0) warnings.push("manuell zugeordnet");
  if (fuzzyMatches > 0) warnings.push("unscharfer Feedback-Abgleich");

  return { items, warnings: Array.from(new Set(warnings)) };
}

export function parseMeyerHornTemplate(
  text: string,
  supplier: string,
  feedback?: ParserFeedbackEntry[],
): InvoiceDraft {
  const header = parseHeader(text);
  const lines = cleanText(text);
  const table = extractTable(lines);
  const baseItems = collect(table);
  const { items, warnings: feedbackWarnings } = applyFeedback(baseItems, feedback);
  const meta = parseMeta(text);

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
      warnings: feedbackWarnings,
    },
    meta,
    warnings,
    errors: [],
    items,
  };

  return withValidation(draft);
}
