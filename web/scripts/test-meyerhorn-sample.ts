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

  console.log(`Sample "${sample.description}": ${draft.items.length} Position(en) erkannt.`);
  console.log(`- Rechnungsnummer: ${draft.invoice_no}`);
  console.log(`- Rechnungsdatum: ${draft.invoice_date}`);
  for (const item of draft.items) {
    console.log(`  #${item.line_no}: ${item.product_name ?? "(ohne Name)"} -> ${item.qty} ${item.uom}`);
  }
}
