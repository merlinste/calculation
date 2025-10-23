// GET or POST /functions/v1/prices-product-history
// - query price history with optional date range filters
// - POST with { correction: { history_id, price_per_base_unit_net } } to update an entry
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { makeClient } from "../_shared/supabaseClient.ts";

type JsonRecord = Record<string, unknown>;

type PurchasePriceHistoryRow = {
  id: number;
  product_id: number;
  date_effective: string;
  uom: string | null;
  price_per_base_unit_net: number;
  qty_in_base_units: number | null;
  source_item_id: number | null;
};

type InvoiceLookupEntry = {
  invoice_id: number | null;
  invoice_no: string | null;
  invoice_date: string | null;
};

const normalizeNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return Number.NaN;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
};

const parseJsonBody = async (req: Request): Promise<JsonRecord | null> => {
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") {
      return parsed as JsonRecord;
    }
    return null;
  } catch (_error) {
    return null;
  }
};

const handleFetch = async (
  req: Request,
  supabase: ReturnType<typeof makeClient>,
  body: JsonRecord | null,
): Promise<Response> => {
  const url = new URL(req.url);

  let productId = normalizeNumber(
    url.searchParams.get("product_id") ?? url.searchParams.get("productId") ?? undefined,
  );

  if ((!productId || Number.isNaN(productId)) && body) {
    productId = normalizeNumber(body.product_id ?? body.productId ?? undefined);
  }

  let from = url.searchParams.get("from") ?? url.searchParams.get("date_from") ?? undefined;
  let to = url.searchParams.get("to") ?? url.searchParams.get("date_to") ?? undefined;

  if (body) {
    if (!from) {
      const candidate = body.from ?? body.date_from ?? body.dateFrom ?? undefined;
      if (typeof candidate === "string" && candidate.trim()) {
        from = candidate.trim();
      }
    }
    if (!to) {
      const candidate = body.to ?? body.date_to ?? body.dateTo ?? undefined;
      if (typeof candidate === "string" && candidate.trim()) {
        to = candidate.trim();
      }
    }
  }

  if (!productId || Number.isNaN(productId)) {
    return jsonResponse(req, { error: "product_id required" }, 400);
  }

  let query = supabase
    .from("purchase_price_history")
    .select(
      "id, product_id, date_effective, uom, price_per_base_unit_net, qty_in_base_units, source_item_id",
    )
    .eq("product_id", productId)
    .order("date_effective");

  if (from) query = query.gte("date_effective", from);
  if (to) query = query.lte("date_effective", to);

  const { data, error } = await query;
  if (error) {
    return jsonResponse(req, { error: error.message }, 500);
  }

  const history = (data ?? []) as PurchasePriceHistoryRow[];
  const sourceIds = Array.from(
    new Set(
      history
        .map((entry) => entry.source_item_id)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
    ),
  );

  const invoiceLookup = new Map<number, InvoiceLookupEntry>();

  if (sourceIds.length) {
    const { data: items, error: itemsError } = await supabase
      .from("purchase_invoice_items")
      .select("id, invoice_id, purchase_invoices(invoice_no, invoice_date)")
      .in("id", sourceIds);

    if (itemsError) {
      return jsonResponse(req, { error: itemsError.message }, 500);
    }

    for (const item of items ?? []) {
      if (!item || typeof item.id !== "number") {
        continue;
      }

      const invoiceRaw = (item as Record<string, unknown>).purchase_invoices;
      const invoice = Array.isArray(invoiceRaw) ? invoiceRaw[0] : invoiceRaw;

      invoiceLookup.set(item.id, {
        invoice_id: typeof item.invoice_id === "number" ? item.invoice_id : null,
        invoice_no: invoice && typeof invoice === "object" && "invoice_no" in invoice
          ? (invoice as Record<string, unknown>).invoice_no ?? null
          : null,
        invoice_date: invoice && typeof invoice === "object" && "invoice_date" in invoice
          ? (invoice as Record<string, unknown>).invoice_date ?? null
          : null,
      });
    }
  }

  const enriched = history.map((entry) => {
    const invoice = entry.source_item_id != null ? invoiceLookup.get(entry.source_item_id) : undefined;
    return {
      ...entry,
      invoice_id: invoice?.invoice_id ?? null,
      invoice_no: invoice?.invoice_no ?? null,
      invoice_date: invoice?.invoice_date ?? null,
    };
  });

  return jsonResponse(req, enriched);
};

const handleCorrection = async (
  req: Request,
  supabase: ReturnType<typeof makeClient>,
  body: JsonRecord,
): Promise<Response> => {
  const correction = body.correction;
  if (!correction || typeof correction !== "object") {
    return jsonResponse(req, { error: "correction payload required" }, 400);
  }

  const correctionRecord = correction as JsonRecord;
  const historyId = normalizeNumber(
    correctionRecord.history_id ??
      correctionRecord.historyId ??
      correctionRecord.id ??
      correctionRecord.price_history_id ??
      correctionRecord.priceHistoryId ??
      undefined,
  );
  const priceCandidate =
    correctionRecord.price_per_base_unit_net ??
    correctionRecord.new_price ??
    correctionRecord.newPrice ??
    correctionRecord.value ??
    correctionRecord.price ??
    undefined;
  const newPrice = normalizeNumber(priceCandidate);

  if (!historyId || Number.isNaN(historyId)) {
    return jsonResponse(req, { error: "history_id required" }, 400);
  }
  if (Number.isNaN(newPrice)) {
    return jsonResponse(req, { error: "price_per_base_unit_net required" }, 400);
  }

  const roundedPrice = Number(newPrice.toFixed(4));

  const { data: existing, error: existingError } = await supabase
    .from("purchase_price_history")
    .select("id, product_id, date_effective, uom, price_per_base_unit_net, source_item_id")
    .eq("id", historyId)
    .maybeSingle();

  if (existingError) {
    return jsonResponse(req, { error: existingError.message }, 500);
  }
  if (!existing) {
    return jsonResponse(req, { error: "price history entry not found" }, 404);
  }

  const previousPrice = existing.price_per_base_unit_net;
  let updatedRow = existing as PurchasePriceHistoryRow;
  let didUpdate = false;

  if (Number(previousPrice) !== roundedPrice) {
    const { data: updateData, error: updateError } = await supabase
      .from("purchase_price_history")
      .update({ price_per_base_unit_net: roundedPrice })
      .eq("id", historyId)
      .select("id, product_id, date_effective, uom, price_per_base_unit_net, qty_in_base_units, source_item_id")
      .single();

    if (updateError) {
      return jsonResponse(req, { error: updateError.message }, 500);
    }

    updatedRow = updateData as PurchasePriceHistoryRow;
    didUpdate = true;
  }

  let invoiceInfo: InvoiceLookupEntry = {
    invoice_id: null,
    invoice_no: null,
    invoice_date: null,
  };

  if (updatedRow.source_item_id != null) {
    const { data: item, error: itemError } = await supabase
      .from("purchase_invoice_items")
      .select("invoice_id, purchase_invoices(invoice_no, invoice_date)")
      .eq("id", updatedRow.source_item_id)
      .maybeSingle();

    if (itemError) {
      return jsonResponse(req, { error: itemError.message }, 500);
    }

    if (item) {
      const invoiceRaw = (item as Record<string, unknown>).purchase_invoices;
      const invoice = Array.isArray(invoiceRaw) ? invoiceRaw[0] : invoiceRaw;
      invoiceInfo = {
        invoice_id: typeof item.invoice_id === "number" ? item.invoice_id : null,
        invoice_no: invoice && typeof invoice === "object" && "invoice_no" in invoice
          ? (invoice as Record<string, unknown>).invoice_no ?? null
          : null,
        invoice_date: invoice && typeof invoice === "object" && "invoice_date" in invoice
          ? (invoice as Record<string, unknown>).invoice_date ?? null
          : null,
      };
    }
  }

  return jsonResponse(req, {
    updated: {
      id: updatedRow.id,
      product_id: updatedRow.product_id,
      date_effective: updatedRow.date_effective,
      uom: updatedRow.uom,
      qty_in_base_units: updatedRow.qty_in_base_units ?? null,
      source_item_id: updatedRow.source_item_id ?? null,
      previous_price_per_base_unit_net: previousPrice,
      price_per_base_unit_net: didUpdate ? roundedPrice : previousPrice,
      invoice_id: invoiceInfo.invoice_id,
      invoice_no: invoiceInfo.invoice_no,
      invoice_date: invoiceInfo.invoice_date,
      did_update: didUpdate,
    },
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(req, { error: "Use GET or POST" }, 405);
  }

  try {
    const supabase = makeClient(req);
    const body = req.method === "POST" ? await parseJsonBody(req) : null;

    if (body && typeof body.correction === "object" && body.correction !== null) {
      return await handleCorrection(req, supabase, body);
    }

    return await handleFetch(req, supabase, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(req, { error: message }, 500);
  }
});
