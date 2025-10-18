import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Product = {
  id: number;
  sku: string;
  name: string;
  base_uom: "piece" | "kg";
  pieces_per_tu: number | null;
  active: boolean;
};

type Feedback = { text: string; tone: "success" | "danger" | "info" } | null;

export default function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [newProduct, setNewProduct] = useState<
    Pick<Product, "sku" | "name" | "base_uom" | "pieces_per_tu" | "active">
  >({
    sku: "",
    name: "",
    base_uom: "piece",
    pieces_per_tu: null,
    active: true,
  });

  const load = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, base_uom, pieces_per_tu, active")
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
      .update({ pieces_per_tu: product.pieces_per_tu, base_uom: product.base_uom })
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
      base_uom: newProduct.base_uom,
      pieces_per_tu: newProduct.pieces_per_tu ?? null,
      active: newProduct.active,
    });

    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      setFeedback({ text: "Produkt angelegt.", tone: "success" });
      setNewProduct({ sku: "", name: "", base_uom: "piece", pieces_per_tu: null, active: true });
      await load();
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
        <h2 className="section-title">Neues Produkt anlegen</h2>
        <form className="form-grid" onSubmit={create}>
          <label>
            <span>SKU</span>
            <input
              type="text"
              value={newProduct.sku}
              onChange={(event) =>
                setNewProduct((state) => ({ ...state, sku: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>Name</span>
            <input
              type="text"
              value={newProduct.name}
              onChange={(event) =>
                setNewProduct((state) => ({ ...state, name: event.target.value }))
              }
              required
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
              value={newProduct.pieces_per_tu ?? ""}
              onChange={(event) =>
                setNewProduct((state) => ({
                  ...state,
                  pieces_per_tu: event.target.value ? Number(event.target.value) : null,
                }))
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
                      value={product.pieces_per_tu ?? 0}
                      onChange={(event) =>
                        setItems((state) =>
                          state.map((item) =>
                            item.id === product.id
                              ? { ...item, pieces_per_tu: Number(event.target.value) }
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
