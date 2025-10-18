import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Product = {
  id: number;
  sku: string;
  name: string;
  base_uom: "piece" | "kg";
  pieces_per_TU: number | null;
  active: boolean;
};

type Supplier = { id: number; name: string };

type NewProduct = {
  name: string;
  sku: string;
  base_uom: Product["base_uom"];
  supplierId: number | null;
};

type Feedback = { text: string; tone: "success" | "danger" | "info" } | null;

export default function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [creating, setCreating] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProduct>({
    name: "",
    sku: "",
    base_uom: "piece",
    supplierId: null,
  });

  const load = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, base_uom, pieces_per_TU, active")
      .order("id");
    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      setItems((data as Product[]) ?? []);
    }
  };

  const loadSuppliers = async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name")
      .order("name");
    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      setSuppliers((data as Supplier[]) ?? []);
    }
  };

  useEffect(() => {
    void load();
    void loadSuppliers();
  }, []);

  const update = async (product: Product) => {
    const { error } = await supabase
      .from("products")
      .update({ pieces_per_TU: product.pieces_per_TU, base_uom: product.base_uom })
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

    if (!newProduct.name.trim() || !newProduct.sku.trim() || !newProduct.supplierId) {
      setFeedback({ text: "Bitte alle Pflichtfelder ausfüllen.", tone: "info" });
      return;
    }

    setCreating(true);
    const { error } = await supabase.from("products").insert({
      name: newProduct.name.trim(),
      sku: newProduct.sku.trim(),
      base_uom: newProduct.base_uom,
      supplier_id: newProduct.supplierId,
    });

    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      setFeedback({ text: "Produkt erfolgreich angelegt.", tone: "success" });
      setNewProduct({ name: "", sku: "", base_uom: "piece", supplierId: null });
      await load();
    }
    setCreating(false);
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
        <h2 className="section-title">Neues Produkt anlegen</h2>
        <form className="form-grid two-columns" onSubmit={create}>
          <label>
            <span>Name</span>
            <input
              value={newProduct.name}
              onChange={(event) =>
                setNewProduct((state) => ({ ...state, name: event.target.value }))
              }
              placeholder="Produktname"
              required
            />
          </label>
          <label>
            <span>Artikelnummer</span>
            <input
              value={newProduct.sku}
              onChange={(event) =>
                setNewProduct((state) => ({ ...state, sku: event.target.value }))
              }
              placeholder="z. B. SKU-123"
              required
            />
          </label>
          <label>
            <span>Einheit</span>
            <select
              value={newProduct.base_uom}
              onChange={(event) =>
                setNewProduct((state) => ({ ...state, base_uom: event.target.value as Product["base_uom"] }))
              }
              required
            >
              <option value="piece">Stück</option>
              <option value="kg">Kilogramm</option>
            </select>
          </label>
          <label>
            <span>Lieferant</span>
            <select
              value={newProduct.supplierId ?? ""}
              onChange={(event) =>
                setNewProduct((state) => ({
                  ...state,
                  supplierId: event.target.value ? Number(event.target.value) : null,
                }))
              }
              required
            >
              <option value="" disabled>
                Lieferant wählen…
              </option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "8px",
            }}
          >
            <button type="submit" className="btn" disabled={creating}>
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
                <th>Basiseinheit</th>
                <th>Stück pro TU</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => (
                <tr key={product.id}>
                  <td>{product.id}</td>
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
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
                      value={product.pieces_per_TU ?? 0}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id
                              ? { ...item, pieces_per_TU: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
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
