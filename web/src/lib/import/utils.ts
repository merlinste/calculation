import type { AllowedUom, InvoiceDraft, InvoiceLineDraft } from "./types";

export const ALLOWED_UOMS: AllowedUom[] = ["KG", "TU", "STUECK"];

export function normaliseNumber(value: string | number | null | undefined, fractionDigits = 4): number {
  if (typeof value === "number") return Number(value.toFixed(fractionDigits));
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/\s+/g, "")
    .replace(/(?<=\d)[.](?=\d{3}(?:\D|$))/g, "")
    .replace(/,(\d{1,})$/, ".$1");
  const parsed = Number.parseFloat(cleaned);
  return Number(Number.isFinite(parsed) ? parsed.toFixed(fractionDigits) : "0");
}

export function toIsoDate(dateString: string | undefined | null): string {
  if (!dateString) return "";
  const normalised = dateString.trim();
  const match = normalised.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!match) return normalised;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10) - 1;
  const year = Number.parseInt(match[3], 10);
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(fullYear, month, day));
  if (Number.isNaN(date.getTime())) return normalised;
  return date.toISOString().slice(0, 10);
}

export function guessLineType(name: string): "product" | "surcharge" | "shipping" {
  const lower = name.toLowerCase();
  if (/versand|fracht|shipping|lieferung/.test(lower)) return "shipping";
  if (/gebühr|fee|zuschlag|service|aufschlag|porto/.test(lower)) return "surcharge";
  return "product";
}

export function defaultTaxRate(lineType: "product" | "surcharge" | "shipping"): number {
  return lineType === "shipping" ? 19 : 7;
}

export function toAllowedUom(raw: string): {
  uom: AllowedUom | null;
  warning?: string;
  converted?: boolean;
} {
  const upper = raw.trim().toUpperCase();
  if (ALLOWED_UOMS.includes(upper as AllowedUom)) {
    return { uom: upper as AllowedUom };
  }
  if (["ST", "STK", "STUEK", "STCK"].includes(upper)) {
    return { uom: "STUECK", converted: true };
  }
  if (upper.includes("EIMER")) {
    return { uom: "KG", warning: "Mengeneinheit 'Eimer' in Kilogramm umgewandelt" };
  }
  if (upper.includes("KG")) return { uom: "KG" };
  if (upper.includes("TU")) return { uom: "TU" };
  return { uom: null, warning: `Unerwartete Einheit '${raw}'` };
}

export function mergeWarnings(...collections: Array<string | string[] | undefined>): string[] {
  const joined: string[] = [];
  for (const set of collections) {
    if (!set) continue;
    if (Array.isArray(set)) joined.push(...set.filter(Boolean));
    else if (set) joined.push(set);
  }
  return Array.from(new Set(joined.filter(Boolean)));
}

export function recalcTotals(draft: InvoiceDraft): InvoiceDraft {
  const items = draft.items.map((item, idx) => {
    const total = Number((item.qty * item.unit_price_net).toFixed(4));
    const issues = [...item.issues];
    let confidence = Math.max(0, Math.min(1, item.confidence));

    if (!item.product_sku) {
      issues.push("Artikelnummer fehlt");
      confidence = Math.min(confidence, 0.7);
    }
    if (!item.product_name) {
      issues.push("Produktname fehlt");
      confidence = Math.min(confidence, 0.6);
    }
    if (!ALLOWED_UOMS.includes(item.uom)) {
      issues.push(`Einheit ${item.uom} nicht zulässig`);
      confidence = Math.min(confidence, 0.4);
    }

    return {
      ...item,
      line_no: item.line_no || idx + 1,
      line_total_net: total,
      issues: Array.from(new Set(issues)),
      confidence,
    } satisfies InvoiceLineDraft;
  });

  const net = items.reduce((sum, item) => sum + item.line_total_net, 0);
  const tax = items.reduce((sum, item) => sum + (item.line_total_net * item.tax_rate_percent) / 100, 0);
  const gross = net + tax;
  const totals = {
    ...draft.totals,
    net: Number(net.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    gross: Number(gross.toFixed(2)),
  };

  if (totals.reportedGross && totals.reportedGross > 0) {
    const diff = Math.abs(totals.gross - totals.reportedGross);
    const variance = (diff / totals.reportedGross) * 100;
    totals.variancePercent = Number(variance.toFixed(2));
  } else {
    totals.variancePercent = null;
  }

  return {
    ...draft,
    items,
    totals,
  };
}

export function withValidation(draft: InvoiceDraft): InvoiceDraft {
  const recomputed = recalcTotals(draft);
  const warnings = [...recomputed.warnings];

  if (recomputed.totals.variancePercent != null && recomputed.totals.variancePercent > 0.5) {
    warnings.push(
      `Summenabweichung ${recomputed.totals.variancePercent.toFixed(2)} % – bitte Kopfwerte prüfen.`,
    );
  }

  const updatedItems = recomputed.items.map((item) => {
    const issues = [...item.issues];
    if (item.line_type === "shipping" && item.tax_rate_percent < 19) {
      issues.push("Versand sollte mit 19 % besteuert werden");
    }
    if (item.line_type !== "shipping" && item.tax_rate_percent > 7) {
      issues.push("Produktposition mit >7 % Steuer entdeckt");
    }
    return {
      ...item,
      issues: Array.from(new Set(issues)),
    };
  });

  return {
    ...recomputed,
    items: updatedItems,
    warnings: Array.from(new Set(warnings)),
  };
}

export function cloneDraft(draft: InvoiceDraft): InvoiceDraft {
  return JSON.parse(JSON.stringify(draft)) as InvoiceDraft;
}
