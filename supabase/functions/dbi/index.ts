// GET /functions/v1/dbi?product_id=...&channel=LEH|B2B|D2C
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { makeClient } from "../_shared/supabaseClient.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse(req, { error: "Use GET" }, 405);
  }

  try {
    const url = new URL(req.url);
    const productId = Number(url.searchParams.get("product_id") ?? "0");
    const channel = (url.searchParams.get("channel") ?? "D2C") as "LEH" | "B2B" | "D2C";

    if (!productId) {
      return jsonResponse(req, { error: "product_id required" }, 400);
    }

    const supabase = makeClient(req);

    const { data: sale, error: salesError } = await supabase
      .from("current_sales_prices")
      .select("product_id, channel, price_net")
      .eq("product_id", productId)
      .eq("channel", channel)
      .maybeSingle();
    if (salesError) {
      return jsonResponse(req, { error: salesError.message }, 500);
    }

    const { data: cost, error: costError } = await supabase
      .from("current_purchase_costs")
      .select("product_id, purchase_cost_net_per_unit")
      .eq("product_id", productId)
      .maybeSingle();
    if (costError) {
      return jsonResponse(req, { error: costError.message }, 500);
    }

    const sales = sale?.price_net ?? null;
    const purchase = cost?.purchase_cost_net_per_unit ?? null;
    const dbi = sales != null && purchase != null ? Number((sales - purchase).toFixed(4)) : null;
    const db_margin =
      sales != null && sales > 0 && dbi != null ? Number((dbi / sales).toFixed(4)) : null;

    return jsonResponse(req, {
      sales_price_net_per_unit: sales,
      purchase_cost_net_per_unit: purchase,
      dbi,
      db_margin,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(req, { error: message }, 500);
  }
});
