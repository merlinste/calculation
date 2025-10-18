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

type Feedback = { text: string; tone: "success" | "danger" | "info" } | null;

export default function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);

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

  useEffect(() => {
    void load();
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
