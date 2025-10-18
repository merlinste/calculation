// GET /functions/v1/dbi?product_id=...&channel=LEH|B2B|D2C
import { makeClient } from "../_shared/supabaseClient.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const productId = Number(url.searchParams.get("product_id") ?? "0");
  const channel = (url.searchParams.get("channel") ?? "D2C") as "LEH"|"B2B"|"D2C";

  if (!productId) return Response.json({ error: "product_id required" }, { status: 400 });

  const supabase = makeClient(req);

  const { data: sale, error: e1 } = await supabase
    .from("current_sales_prices")
    .select("product_id, channel, price_net")
    .eq("product_id", productId).eq("channel", channel)
    .maybeSingle();
  if (e1) return Response.json({ error: e1.message }, { status: 500 });

  const { data: cost, error: e2 } = await supabase
    .from("current_purchase_costs")
    .select("product_id, purchase_cost_net_per_unit")
    .eq("product_id", productId)
    .maybeSingle();
  if (e2) return Response.json({ error: e2.message }, { status: 500 });

  const sales = sale?.price_net ?? null;
  const purchase = cost?.purchase_cost_net_per_unit ?? null;
  const dbi = (sales!=null && purchase!=null) ? Number((sales - purchase).toFixed(4)) : null;
  const db_margin = (sales!=null && sales>0 && dbi!=null) ? Number((dbi / sales).toFixed(4)) : null;

  return Response.json({
    sales_price_net_per_unit: sales,
    purchase_cost_net_per_unit: purchase,
    dbi,
    db_margin
  });
});
