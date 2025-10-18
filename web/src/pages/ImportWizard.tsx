import { useState } from "react";
import { supabase, functionsUrl } from "../lib/supabase";

function toB64(s: string) {
  return btoa(unescape(encodeURIComponent(s)));
}

type ImportResult = Record<string, unknown> | null;

export default function ImportWizard() {
  const [supplier, setSupplier] = useState("Beyers Koffie");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invDate, setInvDate] = useState("");
  const [alloc, setAlloc] = useState<"per_kg" | "per_piece" | "none">("none");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: "info" | "success" | "danger";
  } | null>(null);

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const text = await file.text();
      const sess = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${functionsUrl}/import-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess?.access_token}`,
        },
        body: JSON.stringify({
          supplier,
          invoice_no: invoiceNo,
          invoice_date: invDate,
          currency: "EUR",
          source: "csv",
          file_base64: toB64(text),
          options: { allocate_surcharges: alloc },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage({ text: errorText || "Import fehlgeschlagen.", tone: "danger" });
        setResult(null);
      } else {
        const json = (await res.json()) as Record<string, unknown>;
        setResult(json);
        setMessage({ text: "Import abgeschlossen.", tone: "success" });
      }
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: "danger" });
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Rechnungen importieren</h1>
        <p>Automatisieren Sie die Aufbereitung Ihrer Eingangsrechnungen – Optionen und Upload in einem Schritt.</p>
      </header>

      <section className="card">
        <h2 className="section-title">Import vorbereiten</h2>
        <div className="form-grid two-columns">
          <label>
            <span>Lieferant</span>
            <input value={supplier} onChange={(event) => setSupplier(event.target.value)} />
          </label>
          <label>
            <span>Rechnungsnummer</span>
            <input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} />
          </label>
          <label>
            <span>Rechnungsdatum</span>
            <input type="date" value={invDate} onChange={(event) => setInvDate(event.target.value)} />
          </label>
          <label>
            <span>Umlage</span>
            <select value={alloc} onChange={(event) => setAlloc(event.target.value as typeof alloc)}>
              <option value="none">Keine</option>
              <option value="per_kg">Pro Kilogramm</option>
              <option value="per_piece">Pro Stück</option>
            </select>
          </label>
          <label>
            <span>CSV Datei</span>
            <input type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div>
          <button type="button" className="btn" onClick={submit} disabled={!file || submitting}>
            {submitting ? "Import läuft…" : "Import starten"}
          </button>
        </div>
        {message && (
          <div
            className={`callout ${
              message.tone === "success" ? "callout--success" : message.tone === "danger" ? "callout--danger" : ""
            }`}
          >
            {message.text}
          </div>
        )}
      </section>

      {result && (
        <section className="card card--shadow-strong">
          <h2 className="section-title">Ergebnis</h2>
          <div className="preformatted">{JSON.stringify(result, null, 2)}</div>
        </section>
      )}
    </div>
  );
}
