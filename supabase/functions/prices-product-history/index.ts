// GET /functions/v1/prices-product-history?product_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
import { makeClient } from "../_shared/supabaseClient.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const productId = Number(url.searchParams.get("product_id") ?? "0");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!productId) return Response.json({ error: "product_id required" }, { status: 400 });

  const supabase = makeClient(req);
  let q = supabase.from("purchase_price_history").select("date_effective, uom, price_per_base_unit_net").eq("product_id", productId).order("date_effective");
  if (from) q = q.gte("date_effective", from);
  if (to)   q = q.lte("date_effective", to);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
});
