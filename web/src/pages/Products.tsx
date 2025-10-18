import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Product = {
  id: number;
  sku: string;
  name: string;
  ean: string | null;
  category: string | null;
  base_uom: "piece" | "kg";
  pieces_per_tu: number | null;
  units_per_carton: number | null;
  cartons_per_palette: number | null;
  active: boolean;
};

type Feedback = { text: string; tone: "success" | "danger" | "info" } | null;

type ProductUpsert = {
  sku: string;
  name: string;
  ean?: string | null;
  category?: string | null;
  base_uom?: Product["base_uom"];
  pieces_per_tu?: number | null;
  units_per_carton?: number | null;
  cartons_per_palette?: number | null;
  active?: boolean;
};

type NewProductFormState = {
  sku: string;
  name: string;
  ean: string;
  category: string;
  base_uom: Product["base_uom"];
  pieces_per_tu: string;
  units_per_carton: string;
  cartons_per_palette: string;
  active: boolean;
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] };
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map((header, index) =>
    index === 0 ? normalizeHeader(header.replace(/^\ufeff/, "")) : normalizeHeader(header),
  );

  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (cols[index] ?? "").trim();
    });
    return record;
  });

  return { headers, rows };
}

function parseNumber(value: string | undefined, errors: string[], fieldName: string, rowNumber: number) {
  if (value === undefined) return undefined;
  if (value === "") return null;
  const normalized = value.replace(/,/g, ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    errors.push(`Zeile ${rowNumber}: "${fieldName}" konnte nicht als Zahl gelesen werden (${value}).`);
    return null;
  }
  return parsed;
}

function parseBoolean(value: string | undefined) {
  if (value === undefined || value === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "ja", "wahr", "aktiv"].includes(normalized)) return true;
  if (["false", "0", "no", "nein", "falsch", "inaktiv"].includes(normalized)) return false;
  return undefined;
}

function parseBaseUom(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["piece", "stueck", "stück", "stk", "st"].includes(normalized)) return "piece" as const;
  if (["kg", "kilogramm", "kilo"].includes(normalized)) return "kg" as const;
  return undefined;
}

function parseProductsCsv(text: string) {
  const { headers, rows } = parseCsv(text);
  const headerSet = new Set(headers);

  if (!headerSet.has("sku")) {
    throw new Error("CSV benötigt eine Spalte 'sku'.");
  }
  if (!headerSet.has("name")) {
    throw new Error("CSV benötigt eine Spalte 'name'.");
  }

  const errors: string[] = [];
  const products: ProductUpsert[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // Kopfzeile ist Zeile 1
    const sku = row.sku?.trim();
    const name = row.name?.trim();

    if (!sku) {
      errors.push(`Zeile ${rowNumber}: SKU fehlt.`);
      return;
    }
    if (!name) {
      errors.push(`Zeile ${rowNumber}: Name fehlt.`);
      return;
    }

    const product: ProductUpsert = { sku, name };

    if (headerSet.has("ean")) {
      product.ean = row.ean ? row.ean : null;
    }
    if (headerSet.has("category")) {
      product.category = row.category ? row.category : null;
    }
    if (headerSet.has("base_uom")) {
      const baseUom = parseBaseUom(row.base_uom);
      if (baseUom) {
        product.base_uom = baseUom;
      }
    }
    if (headerSet.has("pieces_per_tu")) {
      const numberValue = parseNumber(row.pieces_per_tu, errors, "pieces_per_tu", rowNumber);
      if (numberValue !== undefined) product.pieces_per_tu = numberValue;
    }
    if (headerSet.has("units_per_carton")) {
      const numberValue = parseNumber(row.units_per_carton, errors, "units_per_carton", rowNumber);
      if (numberValue !== undefined) product.units_per_carton = numberValue;
    }
    if (headerSet.has("cartons_per_palette")) {
      const numberValue = parseNumber(row.cartons_per_palette, errors, "cartons_per_palette", rowNumber);
      if (numberValue !== undefined) product.cartons_per_palette = numberValue;
    }
    if (headerSet.has("active")) {
      const boolValue = parseBoolean(row.active);
      if (boolValue !== undefined) {
        product.active = boolValue;
      }
    }

    products.push(product);
  });

  return { products, errors };
}

export default function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [newProduct, setNewProduct] = useState<NewProductFormState>({
    sku: "",
    name: "",
    ean: "",
    category: "",
    base_uom: "piece",
    pieces_per_tu: "",
    units_per_carton: "",
    cartons_per_palette: "",
    active: true,
  });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, sku, name, ean, category, base_uom, pieces_per_tu, units_per_carton, cartons_per_palette, active",
      )
      .order("id");
    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      setItems((data as Product[]) ?? []);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const update = async (product: Product) => {
    const { error } = await supabase
      .from("products")
      .update({
        name: product.name.trim(),
        ean: product.ean?.trim() || null,
        category: product.category?.trim() || null,
        base_uom: product.base_uom,
        pieces_per_tu: product.pieces_per_tu ?? null,
        units_per_carton: product.units_per_carton ?? null,
        cartons_per_palette: product.cartons_per_palette ?? null,
        active: product.active,
      })
      .eq("id", product.id);

    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      await load();
      setFeedback({ text: "Änderungen gespeichert.", tone: "success" });
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newProduct.sku.trim() || !newProduct.name.trim()) {
      setFeedback({
        text: "Bitte geben Sie mindestens eine SKU und einen Namen an.",
        tone: "danger",
      });
      return;
    }

    const { error } = await supabase.from("products").insert({
      sku: newProduct.sku.trim(),
      name: newProduct.name.trim(),
      ean: newProduct.ean.trim() || null,
      category: newProduct.category.trim() || null,
      base_uom: newProduct.base_uom,
      pieces_per_tu: newProduct.pieces_per_tu ? Number(newProduct.pieces_per_tu) : null,
      units_per_carton: newProduct.units_per_carton ? Number(newProduct.units_per_carton) : null,
      cartons_per_palette: newProduct.cartons_per_palette ? Number(newProduct.cartons_per_palette) : null,
      active: newProduct.active,
    });

    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      setFeedback({ text: "Produkt angelegt.", tone: "success" });
      setNewProduct({
        sku: "",
        name: "",
        ean: "",
        category: "",
        base_uom: "piece",
        pieces_per_tu: "",
        units_per_carton: "",
        cartons_per_palette: "",
        active: true,
      });
      await load();
    }
  };

  const importProducts = async () => {
    if (!csvFile) return;
    setImporting(true);
    try {
      const text = await csvFile.text();
      const { products, errors } = parseProductsCsv(text);

      if (!products.length) {
        setFeedback({
          text: errors.length ? errors.join(" ") : "Keine gültigen Produktzeilen gefunden.",
          tone: "danger",
        });
        return;
      }

      const { error } = await supabase.from("products").upsert(products, { onConflict: "sku" });
      if (error) {
        setFeedback({ text: error.message, tone: "danger" });
        return;
      }

      await load();
      const messageParts = [`${products.length} Produkte importiert.`];
      if (errors.length) {
        messageParts.push(`Hinweise: ${errors.join(" ")}`);
      }
      setFeedback({ text: messageParts.join(" "), tone: errors.length ? "info" : "success" });
      setCsvFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setFeedback({ text: (error as Error).message, tone: "danger" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Artikelübersicht</h1>
        <p>
          Pflegen Sie Basiseinheiten und Gebindegrößen, damit Import und Kalkulation stets mit
          verlässlichen Daten arbeiten können.
        </p>
      </header>

      <section className="card">
        <h2 className="section-title">Produkte per CSV importieren</h2>
        <p>
          Laden Sie eine CSV-Datei mit mindestens den Spalten <code>sku</code> und <code>name</code>. Optional
          können Sie weitere Informationen wie <code>ean</code>, <code>category</code>,
          <code>pieces_per_tu</code>, <code>units_per_carton</code> oder <code>cartons_per_palette</code> ergänzen.
        </p>
        <div className="form-grid">
          <label>
            <span>CSV Datei</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={importProducts} disabled={!csvFile || importing}>
              {importing ? "Import läuft…" : "CSV importieren"}
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Neues Produkt anlegen</h2>
        <form className="form-grid" onSubmit={create}>
          <label>
            <span>SKU</span>
            <input
              type="text"
              value={newProduct.sku}
              onChange={(event) => setNewProduct((state) => ({ ...state, sku: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>Name</span>
            <input
              type="text"
              value={newProduct.name}
              onChange={(event) => setNewProduct((state) => ({ ...state, name: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>EAN</span>
            <input
              type="text"
              value={newProduct.ean}
              onChange={(event) => setNewProduct((state) => ({ ...state, ean: event.target.value }))}
            />
          </label>
          <label>
            <span>Kategorie</span>
            <input
              type="text"
              value={newProduct.category}
              onChange={(event) => setNewProduct((state) => ({ ...state, category: event.target.value }))}
            />
          </label>
          <label>
            <span>Basiseinheit</span>
            <select
              value={newProduct.base_uom}
              onChange={(event) =>
                setNewProduct((state) => ({
                  ...state,
                  base_uom: event.target.value as Product["base_uom"],
                }))
              }
            >
              <option value="piece">Stück</option>
              <option value="kg">Kilogramm</option>
            </select>
          </label>
          <label>
            <span>Stück pro TU</span>
            <input
              type="number"
              min={0}
              value={newProduct.pieces_per_tu}
              onChange={(event) => setNewProduct((state) => ({ ...state, pieces_per_tu: event.target.value }))}
            />
          </label>
          <label>
            <span>Einheiten pro Karton</span>
            <input
              type="number"
              min={0}
              value={newProduct.units_per_carton}
              onChange={(event) =>
                setNewProduct((state) => ({ ...state, units_per_carton: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Kartons pro Palette</span>
            <input
              type="number"
              min={0}
              value={newProduct.cartons_per_palette}
              onChange={(event) =>
                setNewProduct((state) => ({ ...state, cartons_per_palette: event.target.value }))
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={newProduct.active}
              onChange={(event) =>
                setNewProduct((state) => ({ ...state, active: event.target.checked }))
              }
            />
            <span>Aktiv</span>
          </label>
          <div className="form-actions">
            <button type="submit" className="btn">
              Produkt speichern
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="section-title">Produktdetails</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>SKU</th>
                <th>Name</th>
                <th>EAN</th>
                <th>Kategorie</th>
                <th>Basiseinheit</th>
                <th>Stück pro TU</th>
                <th>Einheiten/Karton</th>
                <th>Kartons/Palette</th>
                <th>Aktiv</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => (
                <tr key={product.id}>
                  <td>{product.id}</td>
                  <td>{product.sku}</td>
                  <td>
                    <input
                      type="text"
                      value={product.name}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id ? { ...item, name: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={product.ean ?? ""}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id ? { ...item, ean: event.target.value || null } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={product.category ?? ""}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id ? { ...item, category: event.target.value || null } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={product.base_uom}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id
                              ? { ...item, base_uom: event.target.value as Product["base_uom"] }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="piece">Stück</option>
                      <option value="kg">Kilogramm</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={product.pieces_per_tu ?? ""}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id
                              ? {
                                  ...item,
                                  pieces_per_tu: event.target.value ? Number(event.target.value) : null,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={product.units_per_carton ?? ""}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id
                              ? {
                                  ...item,
                                  units_per_carton: event.target.value ? Number(event.target.value) : null,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={product.cartons_per_palette ?? ""}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id
                              ? {
                                  ...item,
                                  cartons_per_palette: event.target.value ? Number(event.target.value) : null,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <label className="checkbox" style={{ justifyContent: "center" }}>
                      <input
                        type="checkbox"
                        checked={product.active}
                        onChange={(event) =>
                          setItems((state) =>
                            state.map((item) =>
                              item.id === product.id ? { ...item, active: event.target.checked } : item,
                            ),
                          )
                        }
                      />
                    </label>
                  </td>
                  <td>
                    <button type="button" className="btn btn--small" onClick={() => update(product)}>
                      Speichern
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {feedback && (
          <div
            className={`callout ${
              feedback.tone === "success" ? "callout--success" : feedback.tone === "danger" ? "callout--danger" : ""
            }`}
          >
            {feedback.text}
          </div>
        )}
      </section>
    </div>
  );
}
