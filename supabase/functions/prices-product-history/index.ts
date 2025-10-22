// GET /functions/v1/prices-product-history?product_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { makeClient } from "../_shared/supabaseClient.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(req, { error: "Use GET or POST" }, 405);
  }

  try {
    const url = new URL(req.url);

    const normalizeNumber = (value: unknown): number => {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
      }
      return Number.NaN;
    };

    let productId = normalizeNumber(
      url.searchParams.get("product_id") ?? url.searchParams.get("productId") ?? "0",
    );
    let from = url.searchParams.get("from") ?? url.searchParams.get("date_from") ?? undefined;
    let to = url.searchParams.get("to") ?? url.searchParams.get("date_to") ?? undefined;

    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch (_error) {
        body = undefined;
      }

      if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        if (!productId || Number.isNaN(productId)) {
          productId = normalizeNumber(record.product_id ?? record.productId ?? "0");
        }
        if (!from) {
          const candidate = record.from ?? record.date_from;
          if (typeof candidate === "string" && candidate) {
            from = candidate;
          }
        }
        if (!to) {
          const candidate = record.to ?? record.date_to;
          if (typeof candidate === "string" && candidate) {
            to = candidate;
          }
        }
      }
    }

    if (!productId || Number.isNaN(productId)) {
      return jsonResponse(req, { error: "product_id required" }, 400);
    }

    const supabase = makeClient(req);
    let q = supabase
      .from("purchase_price_history")
      .select("date_effective, uom, price_per_base_unit_net")
      .eq("product_id", productId)
      .order("date_effective");
    if (from) q = q.gte("date_effective", from);
    if (to) q = q.lte("date_effective", to);

    const { data, error } = await q;
    if (error) {
      return jsonResponse(req, { error: error.message }, 500);
    }

    return jsonResponse(req, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(req, { error: message }, 500);
  }
});
