import { useState } from "react";
import { supabase, functionsUrl } from "../lib/supabase";

function toB64(s: string) { return btoa(unescape(encodeURIComponent(s))); }

export default function ImportWizard() {
  const [supplier, setSupplier] = useState("Beyers Koffie");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invDate, setInvDate] = useState("");
  const [alloc, setAlloc] = useState<"per_kg"|"per_piece"|"none">("none");
  const [file, setFile] = useState<File|null>(null);
  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    if (!file) return;
    const text = await file.text();
    const sess = (await supabase.auth.getSession()).data.session;
    const res = await fetch(`${functionsUrl}/import-invoice`, {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization": `Bearer ${sess?.access_token}`
      },
      body: JSON.stringify({
        supplier,
        invoice_no: invoiceNo,
        invoice_date: invDate,
        currency: "EUR",
        source: "csv",
        file_base64: toB64(text),
        options: { allocate_surcharges: alloc }
      })
    });
    setResult(await res.json());
  };

  return (
    <div>
      <h2>Rechnungen – Import</h2>
      <div style={{display:'grid', gap:8, maxWidth:600}}>
        <label>Supplier
          <input value={supplier} onChange={e=>setSupplier(e.target.value)} />
        </label>
        <label>Rechnungsnummer
          <input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} />
        </label>
        <label>Datum
          <input type="date" value={invDate} onChange={e=>setInvDate(e.target.value)} />
        </label>
        <label>Umlage
          <select value={alloc} onChange={e=>setAlloc(e.target.value as any)}>
            <option value="none">keine</option>
            <option value="per_kg">pro kg</option>
            <option value="per_piece">pro Stück</option>
          </select>
        </label>
        <label>CSV Datei
          <input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={submit} disabled={!file}>Import starten</button>
      </div>

      {result && (
        <pre style={{background:'#f6f8fa', padding:12, marginTop:16}}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
