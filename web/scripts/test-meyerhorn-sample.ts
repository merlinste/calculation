import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMeyerHornTemplate } from "../src/lib/import/templates/meyerHorn";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const samples = [
  {
    file: "meyer_horn_multiline_header.txt",
    description: "mehrzeilige Kopfzeile",
  },
  {
    file: "meyer_horn_isolated_labels.txt",
    description: "isolierte Labels für Nummer/Datum",
  },
  {
    file: "meyer_horn_surcharge_percentage.txt",
    description: "Spezial-Zuschlag mit Prozentspalte",
    assert(draft: ReturnType<typeof parseMeyerHornTemplate>) {
      const surcharge = draft.items.find((item) =>
        item.source?.raw?.includes("Gasspeicher- / RML Bilanzierungsumlage"),
      );
      assert.ok(surcharge, "Gasspeicher-Zuschlag wurde nicht erkannt");
      assert.equal(surcharge?.line_type, "surcharge", "Zeile nicht als Zuschlag markiert");
      assert.equal(surcharge?.uom, "KG", "Mengeneinheit sollte auf KG normalisiert werden");
      assert.equal(surcharge?.qty, 42.5, "Kilomenge sollte aus Produktpositionen übernommen werden");
      const expectedUnitPrice = Number((5.1 / 42.5).toFixed(4));
      assert.equal(
        surcharge?.unit_price_net,
        expectedUnitPrice,
        "Zuschlag sollte korrekt auf Kilopreis verteilt werden",
      );
    },
  },
];

for (const sample of samples) {
  const samplePath = resolve(__dirname, `../../samples/${sample.file}`);
  const sampleText = readFileSync(samplePath, "utf8");

  const draft = parseMeyerHornTemplate(sampleText, "Meyer & Horn");

  if (!draft.invoice_no) {
    console.error(`Kein Rechnungsnummer-Feld für Sample "${sample.description}" erkannt.`);
    process.exit(1);
  }

  if (!draft.invoice_date) {
    console.error(`Kein Rechnungsdatum für Sample "${sample.description}" erkannt.`);
    process.exit(1);
  }

  if (draft.items.length === 0) {
    console.error(
      `Keine Positionen erkannt, Parser liefert keine Items für Sample "${sample.description}"`,
    );
    process.exit(1);
  }

  if (draft.warnings.includes("Keine Positionen erkannt")) {
    console.error(
      `Parser meldet weiterhin Warnung 'Keine Positionen erkannt' für Sample "${sample.description}"`,
    );
    process.exit(1);
  }

  if (typeof sample.assert === "function") {
    sample.assert(draft);
  }

  console.log(`Sample "${sample.description}": ${draft.items.length} Position(en) erkannt.`);
  console.log(`- Rechnungsnummer: ${draft.invoice_no}`);
  console.log(`- Rechnungsdatum: ${draft.invoice_date}`);
  for (const item of draft.items) {
    console.log(`  #${item.line_no}: ${item.product_name ?? "(ohne Name)"} -> ${item.qty} ${item.uom}`);
  }

  const firstProduct = draft.items.find((item) => item.line_type === "product");
  if (firstProduct) {
    const feedbackDraft = parseMeyerHornTemplate(sampleText, "Meyer & Horn", [
      {
        supplier: "Meyer & Horn",
        detected_description: `9999 ${firstProduct.product_name ?? ""} 00,00 00,00`,
        detected_sku: null,
        assigned_product_id: 12345,
        assigned_product_sku: "AUTO-123",
        assigned_product_name: "Test-Autofill",
        assigned_uom: firstProduct.uom,
        updated_at: new Date().toISOString(),
      },
    ]);

    const matched = feedbackDraft.items.find((item) => item.line_no === firstProduct.line_no);
    if (!matched) {
      console.error("Feedback-Test fehlgeschlagen: Position wurde nicht gefunden.");
      process.exit(1);
    }
    if (
      matched.product_id !== 12345 ||
      matched.product_sku !== "AUTO-123" ||
      matched.product_name !== "Test-Autofill"
    ) {
      console.error("Feedback-Test fehlgeschlagen: Zuordnung wurde nicht angewendet.");
      process.exit(1);
    }
    if (!matched.issues.includes("manuell zugeordnet")) {
      console.error("Feedback-Test fehlgeschlagen: Hinweis 'manuell zugeordnet' fehlt.");
      process.exit(1);
    }
    if (!matched.issues.includes("textbasierter Abgleich")) {
      console.error("Feedback-Test fehlgeschlagen: Hinweis 'textbasierter Abgleich' fehlt.");
      process.exit(1);
    }
    if (!feedbackDraft.parser.warnings.includes("textbasierter Feedback-Abgleich")) {
      console.error("Feedback-Test fehlgeschlagen: Parser-Warnung für textbasierten Abgleich fehlt.");
      process.exit(1);
    }

    console.log("  Feedback-Mapping: Textabgleich erfolgreich (AUTO-123).");
  }
}
