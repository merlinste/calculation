import { withCors } from "../_shared/cors.ts";
import { makeClient } from "../_shared/supabaseClient.ts";

type SupportedTemplate = {
  id: string;
  label: string;
  source: "csv" | "pdf";
  description: string;
};

const SUPPORTED_TEMPLATES: SupportedTemplate[] = [
  {
    id: "beyers",
    label: "Beyers CSV",
    source: "csv",
    description: "CSV-Layout des Lieferanten Beyers. Enthält Mengen, Preise und Zuschläge."
  },
  {
    id: "meyer_horn",
    label: "Meyer & Horn PDF",
    source: "pdf",
    description: "PDF-Parser für Meyer & Horn Rechnungen inklusive OCR-Fallback."
  }
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", withCors(req));
  }

  if (req.method !== "GET") {
    return Response.json({ error: "Use GET" }, withCors(req, { status: 405 }));
  }

  const supabase = makeClient(req);
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name")
    .limit(50);

  if (error) {
    console.error("import function supplier fetch failed", error);
    return Response.json({ error: error.message }, withCors(req, { status: 500 }));
  }

  return Response.json(
    {
      templates: SUPPORTED_TEMPLATES,
      suppliers: suppliers ?? []
    },
    withCors(req)
  );
});
