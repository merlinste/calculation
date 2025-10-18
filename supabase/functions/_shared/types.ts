export type ImportPayload = {
  supplier: string;
  invoice_no: string;
  invoice_date: string; // ISO (YYYY-MM-DD)
  currency: "EUR";
  source: "csv" | "pdf";
  file_base64?: string;   // für csv (MVP)
  file_url?: string;      // optional (später)
  options?: { allocate_surcharges?: "per_kg" | "per_piece" | "none" };
};

export type ImportRow = {
  supplier: string;
  invoice_no: string;
  invoice_date: string;
  currency: string;
  line_type: "product" | "surcharge" | "shipping";
  product_sku?: string;
  product_name?: string;
  qty: number;
  uom: "TU" | "STUECK" | "KG";
  unit_price_net: number;
  tax_rate_percent: number;
  line_total_net: number;
  pack_definition_hint?: string;
  notes?: string;
};
