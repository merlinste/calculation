import { supabase, functionsUrl, supabaseAnonKey } from "../supabase";
import { withValidation } from "./utils";
import type {
  InvoiceDraft,
  ManualAssignmentPayload,
  ParserFeedbackEntry,
} from "./types";

export async function fetchParserFeedback(supplier: string): Promise<ParserFeedbackEntry[]> {
  const trimmed = supplier.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from("import_parser_feedback")
    .select(
      "supplier, detected_description, detected_sku, assigned_product_id, assigned_product_sku, assigned_product_name, assigned_uom, updated_at",
    )
    .eq("supplier", trimmed)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Konnte Parser-Feedback nicht laden", error);
    return [];
  }

  if (!data?.length) return [];

  return data.map((entry) => ({
    supplier: entry.supplier as string,
    detected_description: entry.detected_description as string,
    detected_sku: (entry.detected_sku ?? null) as string | null,
    assigned_product_id: (entry.assigned_product_id ?? null) as number | null,
    assigned_product_sku: (entry.assigned_product_sku ?? null) as string | null,
    assigned_product_name: (entry.assigned_product_name ?? null) as string | null,
    assigned_uom: (entry.assigned_uom ?? null) as ParserFeedbackEntry["assigned_uom"],
    updated_at: (entry.updated_at ?? null) as string | null,
  }));
}

export type FinalizePdfImportOptions = {
  draft: InvoiceDraft;
  allocation: "per_kg" | "per_piece" | "none";
  manualAssignments?: ManualAssignmentPayload[];
};

export type FinalizePdfImportResult = {
  data?: Record<string, unknown>;
  error?: string;
};

export async function finalizePdfImport(
  options: FinalizePdfImportOptions,
): Promise<FinalizePdfImportResult> {
  try {
    const session = (await supabase.auth.getSession()).data.session;
    const manualFeedback = (options.manualAssignments ?? [])
      .filter((entry) => Number.isFinite(entry.productId))
      .map((entry) => ({
        supplier: entry.supplier,
        line_no: entry.lineNo,
        detected_description: entry.detectedDescription,
        detected_sku: entry.detectedSku ?? null,
        product_id: entry.productId,
        product_sku: entry.productSku ?? null,
        manual_name: entry.manualName ?? null,
        uom: entry.uom ?? null,
      }));

    const payload = {
      mode: "finalize" as const,
      supplier: options.draft.supplier,
      source: "pdf" as const,
      options: { allocate_surcharges: options.allocation },
      draft: withValidation(options.draft),
      manual_feedback: manualFeedback.length ? manualFeedback : undefined,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${functionsUrl}/import-invoice`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: errorText || "Import fehlgeschlagen." };
    }

    const json = (await response.json()) as Record<string, unknown>;
    return { data: json };
  } catch (error) {
    const message = (() => {
      if (error instanceof TypeError) {
        const normalized = error.message.trim().toLowerCase();
        if (normalized === "failed to fetch" || normalized === "fetch failed") {
          return "Import-Service konnte nicht erreicht werden. Bitte prüfen Sie die Netzwerkverbindung oder die Supabase-Konfiguration.";
        }
      }
      return (error as Error).message;
    })();
    return { error: message };
  }
}
