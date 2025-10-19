import {
  defaultTaxRate,
  guessLineType,
  mergeWarnings,
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

const VERSION = "2025-02-19";

const SPECIAL_SURCHARGE_POSITIONS = new Set([79007, 79107]);

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

const TABLE_HEADER_REGEX =
  /(?:pos\.?\s*(?:nr\.|no\.)?|art\.?\s*nr\.?|artikel-?nr\.?|nr\.?|beschreibung|bezeichnung|menge|anzahl|qty|einheit|einh\.|stk\.?|einzelpreis|preis|betrag|gesamt|summe|total|\bEP\b)/i;

const NUMERIC_FIELD_REGEX = /^-?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,\.]\d+)?$/;

function splitParts(line: string): string[] {
  return line
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

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

function looksLikeHeader(text: string): boolean {
  if (!text) return false;
  const normalised = text.replace(/\s+/g, " ");
  const hasPosition = /\b(?:pos(?:ition)?\.?|nr\.?|no\.)\b/i.test(normalised);
  const hasDescription = /\b(?:artikel|beschreibung|bezeichnung)\b/i.test(normalised);
  const hasQtyOrUnit =
    /\b(?:menge|anzahl|qty|einheit|einh\.|stk\.?|st[üu]ck)\b/i.test(normalised);
  const hasPriceOrTotal =
    /\b(?:einzelpreis|stk-?preis|preis|betrag|gesamt|summe|total|netto|\bEP\b)\b/i.test(normalised);
  return hasPosition && hasDescription && hasQtyOrUnit && hasPriceOrTotal;
}

function looksLikeLineStart(line: string): boolean {
  const trimmed = line.trim();
  if (!/^\d+/.test(trimmed)) return false;

  const parts = splitParts(line);
  if (parts.length < 5) return false;

  let numericFields = 0;
  for (const part of parts.slice(1)) {
    const cleaned = part.replace(/[A-Za-z%€$]/g, "");
    if (cleaned && NUMERIC_FIELD_REGEX.test(cleaned)) {
      numericFields += 1;
    }
  }

  return numericFields >= 2;
}

function extractTable(lines: string[]): string[] {
  const MAX_HEADER_SPAN = 4;
  let headerEnd = -1;

  for (let i = 0; i < lines.length; i += 1) {
    let aggregated = "";
    for (let offset = 0; offset < MAX_HEADER_SPAN && i + offset < lines.length; offset += 1) {
      const candidate = lines[i + offset];
      aggregated = aggregated ? `${aggregated} ${candidate}` : candidate;

      if (!TABLE_HEADER_REGEX.test(aggregated)) continue;
      if (!looksLikeHeader(aggregated)) continue;

      headerEnd = i + offset + 1;
      break;
    }
    if (headerEnd !== -1) break;
  }

  let startIndex = headerEnd;
  if (startIndex === -1) {
    startIndex = lines.findIndex((line) => looksLikeLineStart(line));
    if (startIndex === -1) return [];
  }

  const body = lines.slice(startIndex);
  const end = body.findIndex((line) => /(?:Summe|Total|Rechnungsbetrag)/i.test(line));
  return end === -1 ? body : body.slice(0, end);
}

function parseLine(bufferParts: string[], raw: string, fallbackLineNo: number): InvoiceLineDraft | null {
  if (bufferParts.length < 6) return null;

  const parts = [...bufferParts];

  let lineTotalRaw: string | undefined;
  while (parts.length > 0) {
    const candidate = parts.pop();
    if (!candidate) continue;
    const cleaned = candidate.replace(/[A-Za-z%€$]/g, "");
    if (cleaned && NUMERIC_FIELD_REGEX.test(cleaned)) {
      lineTotalRaw = candidate;
      break;
    }
  }
  if (!lineTotalRaw) return null;

  const numericTail: string[] = [];
  while (parts.length > 0) {
    const candidate = parts[parts.length - 1];
    if (!candidate) break;
    const cleaned = candidate.replace(/[A-Za-z%€$]/g, "");
    if (!NUMERIC_FIELD_REGEX.test(cleaned)) {
      break;
    }
    const popped = parts.pop()!;
    numericTail.unshift(popped.replace(/%$/, ""));
  }

  const unitPriceRaw = numericTail.shift();
  if (!unitPriceRaw) return null;

  const isLikelyTax = (value: string | undefined) => {
    if (!value) return false;
    const normalised = normaliseNumber(value);
    if (Number.isNaN(normalised)) return false;
    const rounded = Math.round(normalised);
    return Math.abs(normalised - rounded) < 0.001 && rounded >= 0 && rounded <= 25;
  };

  let taxRateRaw: string | undefined;
  if (numericTail.length) {
    const last = numericTail[numericTail.length - 1];
    if (isLikelyTax(last)) {
      taxRateRaw = numericTail.pop();
    }
  }

  const uomRaw = parts.pop();
  const qtyRaw = parts.pop();

  if (!qtyRaw || !uomRaw || !unitPriceRaw) return null;

  const qty = normaliseNumber(qtyRaw);
  const { uom, warning } = toAllowedUom(uomRaw);
  const resolvedUom = uom ?? "STUECK";
  const unitPrice = normaliseNumber(unitPriceRaw);
  const lineTotal = normaliseNumber(lineTotalRaw, 2);

  const taxRate = taxRateRaw ? normaliseNumber(taxRateRaw) : null;

  const headParts = parts;

  let posRaw: string | undefined;
  let skuRaw: string | undefined;
  let descriptionParts: string[] = headParts;

  const first = headParts[0];
  const second = headParts[1];

  const looksLikePos = (value: string | undefined) =>
    value != null && /^\d{1,3}$/.test(value.trim());
  const looksLikeSku = (value: string | undefined) =>
    value != null && value.trim().length >= 3 && (/[0-9]/.test(value) || /[-/]/.test(value));

  if (looksLikePos(first) && looksLikeSku(second)) {
    [posRaw, skuRaw] = headParts.slice(0, 2);
    descriptionParts = headParts.slice(2);
  } else if (looksLikePos(first) && !looksLikeSku(second)) {
    posRaw = first;
    descriptionParts = headParts.slice(1);
  } else if (looksLikeSku(first)) {
    skuRaw = first;
    descriptionParts = headParts.slice(1);
  }

  const pos = posRaw ? Number.parseInt(posRaw, 10) : fallbackLineNo;
  const name = descriptionParts.join(" ");
  const lineType = guessLineType(name);
  const effectiveTax =
    lineType === "shipping" ? 19 : taxRate != null && !Number.isNaN(taxRate) ? taxRate : defaultTaxRate(lineType);

  const issues: string[] = [];
  if (warning) issues.push(warning);
  if (!uom) {
    issues.push(`Mengeneinheit '${uomRaw}' als STUECK interpretiert`);
  }

  let confidence = skuRaw ? 0.92 : 0.78;
  if (issues.length) confidence = Math.min(confidence, 0.7);

  return {
    line_no: Number.isNaN(pos) ? fallbackLineNo : pos,
    line_type: lineType,
    product_sku: skuRaw || undefined,
    product_name: name || undefined,
    qty,
    uom: resolvedUom,
    unit_price_net: unitPrice,
    tax_rate_percent: effectiveTax,
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
    const parts = splitParts(line);

    const trimmed = line.trim();
    if ((/^\d+\b/.test(trimmed) || /^\d{4,}/.test(parts[0] ?? "")) && parts.length >= 6) {
      buffer = line;
    } else if (buffer) {
      buffer = `${buffer} ${line}`;
    } else {
      continue;
    }

    const combinedParts = splitParts(buffer);

    const parsed = parseLine(combinedParts, buffer, fallbackLineNo);
    if (parsed) {
      items.push(parsed);
      buffer = null;
      fallbackLineNo += 1;
    }
  }

  if (buffer) {
    const combinedParts = splitParts(buffer);
    const parsed = parseLine(combinedParts, buffer, fallbackLineNo);
    if (parsed) items.push(parsed);
  }

  return items;
}

function adjustSpecialSurcharges(items: InvoiceLineDraft[]): {
  items: InvoiceLineDraft[];
  warnings: string[];
} {
  const containsSpecial = items.some((item) => SPECIAL_SURCHARGE_POSITIONS.has(item.line_no));
  if (!containsSpecial) {
    return { items, warnings: [] };
  }

  const totalKg = items
    .filter((item) => item.line_type === "product" && item.uom === "KG")
    .reduce((sum, item) => sum + item.qty, 0);

  if (totalKg <= 0) {
    const updatedItems = items.map((item) => {
      if (!SPECIAL_SURCHARGE_POSITIONS.has(item.line_no)) return item;
      const issues = Array.from(
        new Set([...item.issues, "Zuschlag konnte mangels Kilomenge nicht verteilt werden"]),
      );
      return {
        ...item,
        line_type: "surcharge",
        product_id: undefined,
        product_sku: undefined,
        uom: "KG",
        issues,
      } satisfies InvoiceLineDraft;
    });
    return {
      items: updatedItems,
      warnings: ["Energie- und Gaszuschlag ohne Kilogramm-Basis – bitte prüfen."],
    };
  }

  const qtyKg = Number(totalKg.toFixed(3));
  const updatedItems = items.map((item) => {
    if (!SPECIAL_SURCHARGE_POSITIONS.has(item.line_no)) return item;
    const lineTotal = item.line_total_net;
    const unitPrice = qtyKg > 0 ? Number((lineTotal / totalKg).toFixed(4)) : item.unit_price_net;
    return {
      ...item,
      line_type: "surcharge",
      product_id: undefined,
      product_sku: undefined,
      qty: qtyKg,
      uom: "KG",
      unit_price_net: unitPrice,
    } satisfies InvoiceLineDraft;
  });

  return {
    items: updatedItems,
    warnings: ["Energie- und Gaszuschläge auf Kilogramm umgerechnet"],
  };
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
  bySku: Map<string, ParserFeedbackEntry[]>;
  byCombined: Map<string, ParserFeedbackEntry[]>;
  byDescription: Map<string, ParserFeedbackEntry[]>;
  entries: ParserFeedbackEntry[];
};

function buildFeedbackLookup(feedback: ParserFeedbackEntry[] | undefined): FeedbackLookup {
  const bySku = new Map<string, ParserFeedbackEntry[]>();
  const byCombined = new Map<string, ParserFeedbackEntry[]>();
  const byDescription = new Map<string, ParserFeedbackEntry[]>();
  const entries: ParserFeedbackEntry[] = [];

  for (const entry of feedback ?? []) {
    const descKey = normaliseDescription(entry.detected_description);
    const skuKey = normaliseSku(entry.detected_sku);
    if (!descKey && !skuKey) continue;

    if (skuKey) {
      if (!bySku.has(skuKey)) bySku.set(skuKey, []);
      bySku.get(skuKey)!.push(entry);
    }

    if (descKey) {
      const combinedKey = `${descKey}__${skuKey}`;
      if (!byCombined.has(combinedKey)) byCombined.set(combinedKey, []);
      byCombined.get(combinedKey)!.push(entry);

      if (!byDescription.has(descKey)) byDescription.set(descKey, []);
      byDescription.get(descKey)!.push(entry);
    }

    entries.push(entry);
  }

  return { bySku, byCombined, byDescription, entries };
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
  strategy: "sku" | "combined" | "description" | "fuzzy";
};

function findFeedbackMatch(
  line: InvoiceLineDraft,
  lookup: FeedbackLookup,
): FeedbackMatch | null {
  if (lookup.entries.length === 0) return null;
  const sourceKey = normaliseDescription(line.source?.raw);
  const nameKey = normaliseDescription(line.product_name);
  const skuKey = normaliseSku(line.product_sku);

  if (skuKey) {
    const match = pickPreferredEntry(lookup.bySku.get(skuKey));
    if (match) return { entry: match, strategy: "sku" };
  }

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
    if (item.line_type !== "product") return item;
    const match = findFeedbackMatch(item, lookup);
    if (!match) return item;

    const alreadyApplied =
      (match.entry.assigned_product_id == null || item.product_id === match.entry.assigned_product_id) &&
      (match.entry.assigned_product_sku == null || item.product_sku === match.entry.assigned_product_sku) &&
      (match.entry.assigned_product_name == null || item.product_name === match.entry.assigned_product_name) &&
      (match.entry.assigned_uom == null || item.uom === match.entry.assigned_uom);
    if (alreadyApplied) return item;

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
  const { items: surchargeAdjusted, warnings: surchargeWarnings } = adjustSpecialSurcharges(baseItems);
  const { items, warnings: feedbackWarnings } = applyFeedback(surchargeAdjusted, feedback);
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
      warnings: mergeWarnings(feedbackWarnings, surchargeWarnings),
    },
    meta,
    warnings,
    errors: [],
    items,
  };

  return withValidation(draft);
}
