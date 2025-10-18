export type ImportPayload = {
  supplier: string;
  invoice_no?: string;
  invoice_date?: string; // ISO (YYYY-MM-DD)
  currency?: "EUR";
  source: "csv" | "pdf";
  mode?: "preview" | "finalize";
  file_base64?: string;   // für csv (MVP)
  file_url?: string;      // optional (später)
  options?: { allocate_surcharges?: "per_kg" | "per_piece" | "none" };
  draft?: InvoiceDraft;
};

export type ImportRow = {
  supplier: string;
  invoice_no: string;
  invoice_date: string;
  currency: string;
  line_type: "product" | "surcharge" | "shipping";
  product_sku?: string;
  product_name?: string;
  product_id?: number | null;
  qty: number;
  uom: "TU" | "STUECK" | "KG";
  unit_price_net: number;
  tax_rate_percent: number;
  line_total_net: number;
  pack_definition_hint?: string;
  notes?: string;
  confidence?: number;
  issues?: string[];
  line_no?: number;
};

export type InvoiceDraftLine = ImportRow & {
  line_no: number;
  confidence: number;
  issues: string[];
};

export type InvoiceDraft = {
  supplier: string;
  invoice_no: string;
  invoice_date: string;
  currency: string;
  totals: {
    net: number;
    tax: number;
    gross: number;
    reportedGross?: number | null;
    variancePercent?: number | null;
  };
  parser: {
    template: string;
    version: string;
    usedOcr: boolean;
    warnings: string[];
  };
  meta?: { key: string; label: string; value: string }[];
  warnings: string[];
  errors: string[];
  items: InvoiceDraftLine[];
};
