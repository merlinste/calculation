export type AllowedUom = "KG" | "TU" | "STUECK";

export type InvoiceLineDraft = {
  line_no: number;
  line_type: "product" | "surcharge" | "shipping";
  product_sku?: string;
  product_name?: string;
  product_id?: number | null;
  qty: number;
  uom: AllowedUom;
  unit_price_net: number;
  tax_rate_percent: number;
  line_total_net: number;
  pack_definition_hint?: string;
  notes?: string | null;
  confidence: number;
  issues: string[];
  source?: {
    raw?: string;
    template_hint?: string;
  };
};

export type InvoiceDraftTotals = {
  net: number;
  tax: number;
  gross: number;
  reportedGross?: number | null;
  variancePercent?: number | null;
};

export type InvoiceDraftParserMeta = {
  template: string;
  version: string;
  usedOcr: boolean;
  warnings: string[];
};

export type InvoiceMetaField = {
  key: string;
  label: string;
  value: string;
};

export type InvoiceDraft = {
  supplier: string;
  invoice_no: string;
  invoice_date: string;
  currency: string;
  totals: InvoiceDraftTotals;
  parser: InvoiceDraftParserMeta;
  meta: InvoiceMetaField[];
  warnings: string[];
  errors: string[];
  items: InvoiceLineDraft[];
};
