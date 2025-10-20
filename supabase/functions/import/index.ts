// POST /functions/v1/import
// Payload: ImportPayload (csv-MVP via file_base64)

import { withCors } from "../_shared/cors.ts";
import { makeClient } from "../_shared/supabaseClient.ts";
import type { ImportPayload, ImportRow, InvoiceDraft, ManualFeedbackInput } from "../_shared/types.ts";
import { parseBeyers } from "../_shared/parsers/beyers.ts";
import { parseMeyerHorn } from "../_shared/parsers/meyer_horn.ts";
import { allocateSurcharges } from "../_shared/surcharge_allocator.ts";

type BaseUom = "piece" | "kg";

function b64decode(b64: string) {
  const bytes = atob(b64);
  const buf = new Uint8Array(bytes.length);
  for (let i=0;i<bytes.length;i++) buf[i] = bytes.charCodeAt(i);
  return new TextDecoder().decode(buf);
}

function toBaseUom(uom: "TU" | "STUECK" | "KG", productBase: BaseUom, piecesPerTU?: number) {
  if (productBase === "kg") {
    if (uom === "KG") return { qtyFactor: 1, baseUom: "kg" as const };
    return { qtyFactor: NaN, baseUom: "kg" as const };
  } else {
    if (uom === "STUECK") return { qtyFactor: 1, baseUom: "piece" as const };
    if (uom === "TU" && piecesPerTU && piecesPerTU > 0) return { qtyFactor: piecesPerTU, baseUom: "piece" as const };
    return { qtyFactor: NaN, baseUom: "piece" as const };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", withCors(req));
  }

  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Use POST" }, withCors(req, { status: 405 }));
    }
    const supabase = makeClient(req);
    const payload = (await req.json()) as ImportPayload;

    const warnings: string[] = [];
    const errors: string[] = [];

    const opMode = payload.mode ?? "finalize";
    if (payload.source === "pdf" && opMode !== "finalize") {
      return Response.json({ status: "error", errors: ["Preview wird clientseitig durchgeführt."] }, withCors(req, { status: 400 }));
    }

    let rows: ImportRow[] = [];
    let supplier = payload.supplier;
    let invoiceNo = payload.invoice_no ?? "";
    let invoiceDate = payload.invoice_date ?? "";
    let currency = (payload.currency ?? "EUR") as "EUR";
    let reviewTotals: InvoiceDraft["totals"] | undefined;

    if (payload.source === "pdf") {
      const draft = payload.draft;
      if (!draft) {
        return Response.json({ status: "error", errors: ["draft erforderlich"] }, withCors(req, { status: 400 }));
      }
      supplier = draft.supplier || supplier;
      invoiceNo = draft.invoice_no || invoiceNo;
      invoiceDate = draft.invoice_date || invoiceDate;
      currency = (draft.currency || currency) as "EUR";
      reviewTotals = draft.totals;
      warnings.push(...(draft.warnings ?? []), ...(draft.parser?.warnings ?? []));
      errors.push(...(draft.errors ?? []));

      rows = draft.items.map((item) => ({
        supplier,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        currency,
        line_type: item.line_type,
        product_sku: item.product_sku,
        product_name: item.product_name,
        product_id: item.product_id ?? undefined,
        qty: item.qty,
        uom: item.uom,
        unit_price_net: item.unit_price_net,
        tax_rate_percent: item.tax_rate_percent,
        line_total_net: item.line_total_net ?? item.qty * item.unit_price_net,
        pack_definition_hint: item.pack_definition_hint,
        notes: item.notes ?? undefined,
        confidence: item.confidence,
        issues: item.issues,
        line_no: item.line_no,
      }));
      if (!rows.length) {
        return Response.json({ status: "error", errors: ["Keine Positionen im Review übermittelt."] }, withCors(req, { status: 400 }));
      }
      supplier = supplier || "Unknown Supplier";
      invoiceNo = invoiceNo || draft.invoice_no;
      invoiceDate = invoiceDate || draft.invoice_date;
    } else {
      if (!payload.file_base64) {
        return Response.json({ status: "error", errors: ["file_base64 (CSV) erforderlich"] }, withCors(req, { status: 400 }));
      }

      const csv = b64decode(payload.file_base64);
      const supplierName = payload.supplier?.toLowerCase() ?? "";

      if (supplierName.includes("beyers")) rows = parseBeyers(csv);
      else if (supplierName.includes("meyer") || supplierName.includes("horn")) rows = parseMeyerHorn(csv);
      else {
        // Fallback: versuche generisches Mapping
        rows = parseBeyers(csv);
        warnings.push("Unbekannter Supplier – generische CSV-Zuordnung versucht (Beyers-Layout).");
      }

      if (!rows.length) return Response.json({ status: "error", errors: ["CSV leer"] }, withCors(req, { status: 400 }));

      // Header aus erster Zeile (CSV enthält ohnehin Kopf-Felder je Zeile)
      const hdr = rows[0];
      supplier = payload.supplier || hdr.supplier || "Unknown Supplier";
      invoiceNo = payload.invoice_no || hdr.invoice_no;
      invoiceDate = payload.invoice_date || hdr.invoice_date;
      currency = (payload.currency || hdr.currency || "EUR") as "EUR";
    }

    // Supplier upsert
    const { data: supFind, error: supErr } = await supabase
      .from("suppliers")
      .select("id")
      .eq("name", supplier)
      .maybeSingle();

    if (supErr) throw supErr;

    let supplierId = supFind?.id as number | undefined;
    if (!supplierId) {
      const { data: ins, error: insErr } = await supabase
        .from("suppliers")
        .insert({ name: supplier })
        .select("id")
        .single();
      if (insErr) throw insErr;
      supplierId = ins.id;
    }

    // Duplikatschutz
    const { data: invDup, error: invDupErr } = await supabase
      .from("purchase_invoices")
      .select("id")
      .eq("supplier_id", supplierId)
      .eq("invoice_no", invoiceNo)
      .maybeSingle();
    if (invDupErr) throw invDupErr;
    if (invDup?.id) {
      return Response.json({ status: "error", errors: [`Rechnung ${invoiceNo} bei ${supplier} existiert bereits (id=${invDup.id}).`] }, withCors(req, { status: 409 }));
    }

    const manualFeedbackEntries = (payload.manual_feedback ?? []).filter((entry) =>
      entry && entry.detected_description && entry.detected_description.trim() && entry.product_id != null
    );

    if (manualFeedbackEntries.length) {
      const feedbackRows = manualFeedbackEntries.map((entry: ManualFeedbackInput) => ({
        supplier: entry.supplier || supplier,
        detected_description: entry.detected_description.trim(),
        detected_sku: entry.detected_sku?.trim() ?? null,
        assigned_product_id: entry.product_id ?? null,
        assigned_product_sku: entry.product_sku?.trim() ?? null,
        assigned_product_name: entry.manual_name?.trim() ?? null,
        assigned_uom: entry.uom ?? null,
        updated_at: new Date().toISOString(),
      }));

      if (feedbackRows.length) {
        const { error: feedbackErr } = await supabase
          .from("import_parser_feedback")
          .upsert(feedbackRows, { onConflict: "supplier,detected_description,detected_sku" });
        if (feedbackErr) throw feedbackErr;
      }
    }

    // Summen aus CSV berechnen
    const netSum = rows.reduce((a, r) => a + (r.line_total_net || r.qty * r.unit_price_net), 0);
    const taxSum = rows.reduce((a, r) => a + ((r.line_total_net || r.qty * r.unit_price_net) * (r.tax_rate_percent/100)), 0);
    const grossSum = netSum + taxSum;

    if (reviewTotals?.reportedGross) {
      const diff = Math.abs(grossSum - reviewTotals.reportedGross);
      const variance = (diff / reviewTotals.reportedGross) * 100;
      if (variance > 0.5) {
        warnings.push(`Summenabweichung ${variance.toFixed(2)} % zwischen Parser und Rechnung.`);
      }
    }

    if (reviewTotals?.variancePercent != null) {
      warnings.push(`Review-Check: gemeldete Abweichung ${reviewTotals.variancePercent.toFixed(2)} %.`);
    }

    // Rechnung anlegen
    const { data: inv, error: invErr } = await supabase
      .from("purchase_invoices")
      .insert({
        supplier_id: supplierId,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        currency,
        net_amount: Number(netSum.toFixed(2)),
        tax_amount: Number(taxSum.toFixed(2)),
        gross_amount: Number(grossSum.toFixed(2))
      })
      .select("id")
      .single();
    if (invErr) throw invErr;

    const invoiceId = inv.id as number;

    // Zeilen verarbeiten: Produkte & Surcharges/Shipping
    // 1) Produkt-Zeilen vorbereiten: Produkt finden/erstellen, UoM normalisieren
    type ItemPrepared = {
      row: ImportRow;
      itemId?: number;
      product_id?: number;
      base_uom?: BaseUom;
      qty_base?: number;
      base_price_per_unit?: number; // nettopreis pro Basiseinheit (ohne Umlage)
    };

    const productRows = rows.filter(r => r.line_type === "product");
    const surchargeTotal = rows.filter(r => r.line_type === "surcharge").reduce((a,r)=>a + (r.line_total_net || r.qty*r.unit_price_net),0);

    const prepared: ItemPrepared[] = [];

    for (const r of productRows) {
      // Produktzuordnung: erst über Id, sonst SKU oder Name (rudimentär)
      let product: { id: number; base_uom: BaseUom; pieces_per_TU: number | null } | null = null;

      if (r.product_id) {
        const { data: prod, error: prodErr } = await supabase
          .from("products")
          .select("id, base_uom, pieces_per_TU")
          .eq("id", r.product_id)
          .maybeSingle();
        if (prodErr) throw prodErr;
        if (prod) product = { id: prod.id, base_uom: prod.base_uom as BaseUom, pieces_per_TU: prod.pieces_per_TU };
      }

      if (!product && r.product_sku) {
        const { data: prod, error: prodErr } = await supabase
          .from("products")
          .select("id, base_uom, pieces_per_TU")
          .eq("sku", r.product_sku)
          .maybeSingle();
        if (prodErr) throw prodErr;
        if (prod) product = { id: prod.id, base_uom: prod.base_uom as BaseUom, pieces_per_TU: prod.pieces_per_TU };
      }

      if (!product && r.product_name) {
        const { data: prodByName, error: prodNameErr } = await supabase
          .from("products")
          .select("id, base_uom, pieces_per_TU")
          .ilike("name", r.product_name)
          .maybeSingle();
        if (prodNameErr) throw prodNameErr;
        if (prodByName) product = { id: prodByName.id, base_uom: prodByName.base_uom as BaseUom, pieces_per_TU: prodByName.pieces_per_TU };
      }

      if (!product) {
        // Grobe Heuristik für base_uom
        const base_uom: BaseUom = r.uom === "KG" ? "kg" : "piece";
        const pieces = (base_uom === "piece" ?  (r.uom === "TU" ? 100 : 1) : null); // MVP: 100/Stk pro TU als default
        warnings.push(`Produkt unbekannt – neu angelegt: SKU=${r.product_sku ?? "n/a"} Name=${r.product_name ?? "n/a"} (base_uom=${base_uom}, pieces_per_TU=${pieces ?? "null"})`);
        const { data: created, error: createErr } = await supabase.from("products")
          .insert({
            sku: r.product_sku ?? `AUTO-${crypto.randomUUID().slice(0,8)}`,
            name: r.product_name ?? "Unbekannt",
            base_uom,
            pieces_per_TU: pieces
          })
          .select("id, base_uom, pieces_per_TU")
          .single();
        if (createErr) throw createErr;
        product = { id: created.id, base_uom: created.base_uom as BaseUom, pieces_per_TU: created.pieces_per_TU };
      }

      const { qtyFactor, baseUom } = toBaseUom(r.uom, product.base_uom, product.pieces_per_TU ?? undefined);
      if (Number.isNaN(qtyFactor)) {
        warnings.push(`UoM-Konflikt bei SKU ${r.product_sku ?? r.product_name}: uom=${r.uom}, base=${product.base_uom}. Zeile wird übernommen, aber Preis-Historie kann evtl. nicht berechnet werden.`);
      }

      const qty_base = Number.isNaN(qtyFactor) ? 0 : r.qty * qtyFactor;
      // Nettopreis pro Basiseinheit (ohne Umlagen)
      const base_price_per_unit = Number.isNaN(qtyFactor) || qtyFactor===0
        ? 0
        : Number((r.unit_price_net / qtyFactor).toFixed(4));

      // Invoice Item anlegen
      const { data: item, error: itemErr } = await supabase
        .from("purchase_invoice_items")
        .insert({
          invoice_id: invoiceId,
          product_id: product.id,
          line_type: "product",
          qty: r.qty,
          uom: r.uom,
          unit_price_net: r.unit_price_net,
          discount_abs: 0,
          tax_rate: r.tax_rate_percent,
          notes: r.notes ?? null
        })
        .select("id")
        .single();
      if (itemErr) throw itemErr;

      prepared.push({
        row: r,
        itemId: item.id,
        product_id: product.id,
        base_uom: baseUom,
        qty_base,
        base_price_per_unit
      });
    }

    // Surcharge- und Shipping-Zeilen als Items speichern (für Vollständigkeit)
    for (const r of rows.filter(r => r.line_type !== "product")) {
      const { error: itemErr } = await supabase
        .from("purchase_invoice_items")
        .insert({
          invoice_id: invoiceId,
          product_id: null,
          line_type: r.line_type,
          qty: r.qty,
          uom: r.uom,
          unit_price_net: r.unit_price_net,
          discount_abs: 0,
          tax_rate: r.tax_rate_percent,
          notes: r.notes ?? null
        });
      if (itemErr) throw itemErr;
    }

    // Allokations-Policy
    let allocMode: "per_kg" | "per_piece" | "none" = payload.options?.allocate_surcharges ?? "none";
    if (!payload.options?.allocate_surcharges) {
      // Supplier-Default (neueste aktive Policy)
      const { data: pol } = await supabase
        .from("settings_cost_allocation")
        .select("policy")
        .eq("supplier_id", supplierId)
        .lte("active_from", invoiceDate)
        .order("active_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pol?.policy) allocMode = pol.policy as typeof allocMode;
    }

    const allocated = allocateSurcharges({
        items: prepared.map(p => ({
          product_id: p.product_id!,
          base_uom: p.base_uom!,
          qty_base: p.qty_base ?? 0,
          base_price_per_unit: p.base_price_per_unit ?? 0
        })),
        totalSurchargeNet: Number(surchargeTotal.toFixed(4)),
        mode: allocMode
    });

    // Preis-Historie schreiben (nur Produktzeilen)
    let createdHistory = 0;
    for (let i=0; i<prepared.length; i++) {
      const p = prepared[i];
      const al = allocated[i];
      if (!p.itemId || !p.product_id || !p.base_uom || !p.qty_base || p.qty_base<=0) continue;

      const price_per_base_unit_net = Number((p.base_price_per_unit! + (al.surcharge_per_unit ?? 0)).toFixed(4));

      const { error: histErr } = await supabase
        .from("purchase_price_history")
        .insert({
          product_id: p.product_id,
          date_effective: invoiceDate,
          uom: p.base_uom,
          price_per_base_unit_net,
          qty_in_base_units: p.qty_base,
          source_item_id: p.itemId
        });
      if (!histErr) createdHistory++;
      else warnings.push(`History-Insert Warnung: ${histErr.message}`);
    }

    if (payload.source === "csv") {
      warnings.push("Summenprüfung: CSV ohne Kopf-Summen – geprüft wurden nur Zeilensummen (OK).");
    }

    return Response.json({
      status: "ok",
      invoice_id: invoiceId,
      items_imported: prepared.length,
      warnings,
      errors
    }, withCors(req));
  } catch (e) {
    console.error("import-invoice error", e);
    return Response.json({ status: "error", errors: [String(e?.message ?? e)] }, withCors(req, { status: 500 }));
  }
});
