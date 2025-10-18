import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Supplier = { id: number; name: string };

type Feedback = { text: string; tone: "success" | "danger" | "info" } | null;

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [newSupplierName, setNewSupplierName] = useState("");

  const load = async () => {
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
  }, []);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = newSupplierName.trim();
    if (!trimmed) {
      setFeedback({ text: "Bitte einen Namen für den Lieferanten eintragen.", tone: "info" });
      return;
    }

    setCreating(true);
    const { error } = await supabase.from("suppliers").insert({ name: trimmed });

    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      setFeedback({ text: "Lieferant erfolgreich angelegt.", tone: "success" });
      setNewSupplierName("");
      await load();
    }
    setCreating(false);
  };

  const update = async (supplier: Supplier) => {
    const trimmed = supplier.name.trim();
    if (!trimmed) {
      setFeedback({ text: "Bitte einen Namen für den Lieferanten eintragen.", tone: "info" });
      return;
    }

    setSavingId(supplier.id);
    const { error } = await supabase
      .from("suppliers")
      .update({ name: trimmed })
      .eq("id", supplier.id);

    if (error) {
      setFeedback({ text: error.message, tone: "danger" });
    } else {
      setFeedback({ text: "Änderungen gespeichert.", tone: "success" });
      await load();
    }
    setSavingId(null);
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Lieferanten verwalten</h1>
        <p>Legen Sie neue Lieferanten an oder bearbeiten Sie bestehende Einträge.</p>
      </header>

      <section className="card">
        <h2 className="section-title">Neuen Lieferanten anlegen</h2>
        <form className="form-grid" onSubmit={create}>
          <label>
            <span>Name</span>
            <input
              value={newSupplierName}
              onChange={(event) => setNewSupplierName(event.target.value)}
              placeholder="z. B. Musterlieferant GmbH"
              required
            />
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "8px",
            }}
          >
            <button type="submit" className="btn" disabled={creating}>
              Lieferant speichern
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="section-title">Bestehende Lieferanten</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length ? (
                suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.id}</td>
                    <td>
                      <input
                        value={supplier.name}
                        onChange={(event) =>
                          setSuppliers((state) =>
                            state.map((item) =>
                              item.id === supplier.id ? { ...item, name: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => update(supplier)}
                        disabled={savingId === supplier.id}
                      >
                        Speichern
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    Noch keine Lieferanten vorhanden.
                  </td>
                </tr>
              )}
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
