import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMeyerHornTemplate } from "../src/lib/import/templates/meyerHorn";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const samplePath = resolve(__dirname, "../../samples/meyer_horn_multiline_header.txt");
const sampleText = readFileSync(samplePath, "utf8");

const draft = parseMeyerHornTemplate(sampleText, "Meyer & Horn");

if (draft.items.length === 0) {
  console.error("Keine Positionen erkannt, Parser liefert keine Items");
  process.exit(1);
}

if (draft.warnings.includes("Keine Positionen erkannt")) {
  console.error("Parser meldet weiterhin Warnung 'Keine Positionen erkannt'");
  process.exit(1);
}

console.log(`Erkannte Positionen: ${draft.items.length}`);
for (const item of draft.items) {
  console.log(`- #${item.line_no}: ${item.product_name ?? "(ohne Name)"} -> ${item.qty} ${item.uom}`);
}
