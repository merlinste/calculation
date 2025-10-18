import type { ImportRow } from "../types.ts";
import { parseCsvSimple } from "../csv.ts";

export function parseMeyerHorn(csv: string): ImportRow[] {
  const rows = parseCsvSimple(csv);
  return rows.map(r => ({
    supplier: r.supplier || "Meyer & Horn",
    invoice_no: r.invoice_no,
    invoice_date: r.invoice_date,
    currency: (r.currency || "EUR"),
    line_type: (r.line_type as any) ?? "product",
    product_sku: r.product_sku || undefined,
    product_name: r.product_name || undefined,
    qty: Number(r.qty),
    uom: (r.uom as any) ?? "KG",
    unit_price_net: Number(r.unit_price_net),
    tax_rate_percent: Number(r.tax_rate_percent),
    line_total_net: Number(r.line_total_net),
    pack_definition_hint: r.pack_definition_hint || undefined,
    notes: r.notes || undefined
  }));
}
