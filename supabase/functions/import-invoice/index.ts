// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LineType = "product" | "surcharge" | "shipping";
type AllocationPolicy = "none" | "per_kg" | "per_piece";

interface ImportItem {
  line_type: LineType;
  product_sku?: string;
  product_name?: string;
  qty: number;
  uom: string; // 'TU' | 'KG' | 'STUECK' | ...
  unit_price_net: number;
  tax_rate_percent?: number;
  discount_abs?: number;
}

interface ImportPayload {
  supplier: string;
  invoice_no: string;
  invoice_date: string; // ISO date
  currency?: string; // 'EUR'
  options?: {
    allocate_surcharges?: AllocationPolicy;
    autoCreateProducts?: boolean;
  };
  items: ImportItem[];
}

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "*") });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://puabgoybesfudunexlsl.supabase.co";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1YWJnb3liZXNmdWR1bmV4bHNsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDcxMzE2NiwiZXhwIjoyMDc2Mjg5MTY2fQ.B43LaE800hFUj1KiAktYj3Blc9_yA0nPPLEqjkAO37E";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE_URL or SERVICE_ROLE_KEY" }), {
        status: 500, headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const payload = await req.json() as ImportPayload;
    const allocate = payload.options?.allocate_surcharges ?? "per_kg";
    const autoCreate = payload.options?.autoCreateProducts ?? false;

    // Upsert supplier
    const { data: supplierRow, error: supErr } = await supabase
      .from("suppliers")
      .upsert({ name: payload.supplier }, { onConflict: "name" })
      .select("id").single();
    if (supErr) throw supErr;

    // Insert invoice
    const { data: invoiceRow, error: invErr } = await supabase
      .from("purchase_invoices")
      .insert({
        supplier_id: supplierRow.id,
        invoice_no: payload.invoice_no,
        invoice_date: payload.invoice_date,
        currency: payload.currency ?? "EUR",
      })
      .select("id").single();
    if (invErr) throw invErr;

    const invoiceId = invoiceRow.id as string;

    // Helper: ensure product
    async function ensureProduct(item: ImportItem): Promise<string | null> {
      if (!item.product_sku) return null;
      const { data: prod, error: selErr } = await supabase
        .from("products")
        .select("id, base_uom, pieces_per_tu")
        .eq("sku", item.product_sku)
        .maybeSingle();
      if (selErr) throw selErr;
      if (prod) return prod.id as string;

      if (!autoCreate) {
        throw new Error(`Unknown SKU ${item.product_sku} and autoCreateProducts=false`);
      }

      // Heuristik: TU => piece (100/stk); KG => kg
      const uom = (item.uom || "").toUpperCase();
      const base_uom = uom === "TU" ? "piece" : (uom === "KG" ? "kg" : "piece");
      const pieces = (uom === "TU") ? 100 : null;

      const { data: ins, error: insErr } = await supabase
        .from("products")
        .insert({
          sku: item.product_sku,
          name: item.product_name || item.product_sku,
          base_uom,
          pieces_per_tu: pieces,
        }).select("id").single();
      if (insErr) throw insErr;
      return ins.id as string;
    }

    // Insert items
    for (const it of payload.items) {
      let productId: string | null = null;
      if (it.line_type !== "shipping") {
        productId = await ensureProduct(it);
      }
      const { error: itemErr } = await supabase
        .from("purchase_invoice_items")
        .insert({
          invoice_id: invoiceId,
          product_id: productId,
          line_type: it.line_type,
          qty: it.qty,
          uom: it.uom,
          unit_price_net: it.unit_price_net,
          tax_rate: it.tax_rate_percent ?? null,
          discount_abs: it.discount_abs ?? 0,
        });
      if (itemErr) throw itemErr;
    }

    // Allocation + Price History
    const { error: rpcErr } = await supabase.rpc("finalize_invoice", {
      p_invoice_id: invoiceId,
      p_policy: allocate,
    });
    if (rpcErr) throw rpcErr;

    return new Response(JSON.stringify({ status: "ok", invoice_id: invoiceId }), {
      status: 200, headers: { "content-type": "application/json", ...corsHeaders(req.headers.get("origin") ?? "*") },
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: "error", message: String(e?.message ?? e) }), {
      status: 400, headers: { "content-type": "application/json", ...corsHeaders() },
    });
  }
});
