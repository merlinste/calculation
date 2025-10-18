import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, functionsUrl } from "../lib/supabase";
import { parsePdfInvoice } from "../lib/import/parsePdfInvoice";
import type { InvoiceDraft, InvoiceLineDraft } from "../lib/import/types";
import { ALLOWED_UOMS, cloneDraft, withValidation } from "../lib/import/utils";
import { useProductOptions } from "../lib/useProductOptions";

type ImportResult = Record<string, unknown> | null;

type MessageState = {
  text: string;
  tone: "info" | "success" | "danger";
} | null;

function confidenceClass(confidence: number) {
  if (confidence >= 0.85) return "confidence-pill confidence-pill--high";
  if (confidence >= 0.6) return "confidence-pill confidence-pill--medium";
  return "confidence-pill confidence-pill--low";
}

const SUPPLIER_OPTIONS = [
  { value: "Beyers Koffie", label: "Beyers Koffie" },
  {
    value: "Max Meyer & Max Horn GmbH",
    label: "Max Meyer & Max Horn GmbH",
  },
];

export default function ImportWizard() {
  const [supplier, setSupplier] = useState(SUPPLIER_OPTIONS[0].value);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invDate, setInvDate] = useState("");
  const [alloc, setAlloc] = useState<"per_kg" | "per_piece" | "none">("per_kg");
  const [file, setFile] = useState<File | null>(null);
  const [lastParsedFile, setLastParsedFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [result, setResult] = useState<ImportResult>(null);
  const [message, setMessage] = useState<MessageState>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const {
    products: productOptions,
    loading: loadingProducts,
    error: productError,
  } = useProductOptions();

  const productLookup = useMemo(() => {
    const byId = new Map<number, { id: number; sku: string; name: string }>();
    const bySku = new Map<string, { id: number; sku: string; name: string }>();
    const byName = new Map<string, { id: number; sku: string; name: string }>();
    productOptions.forEach((product) => {
      const entry = { id: product.id, sku: product.sku, name: product.name };
      byId.set(product.id, entry);
      if (product.sku) {
        bySku.set(product.sku.trim().toLowerCase(), entry);
      }
      if (product.name) {
        byName.set(product.name.trim().toLowerCase(), entry);
      }
    });
    return { byId, bySku, byName };
  }, [productOptions]);

  const hasUnsureLines = useMemo(
    () => draft?.items.some((line) => line.issues.length > 0 || line.confidence < 0.7) ?? false,
    [draft?.items],
  );

  const assignProducts = useCallback(
    (baseDraft: InvoiceDraft): InvoiceDraft => {
      const items = baseDraft.items.map((line) => {
        if (line.line_type !== "product") return line;

        const matchedById =
          line.product_id != null ? productLookup.byId.get(line.product_id) : undefined;
        const matchedBySku = line.product_sku
          ? productLookup.bySku.get(line.product_sku.trim().toLowerCase())
          : undefined;
        const matchedByName = line.product_name
          ? productLookup.byName.get(line.product_name.trim().toLowerCase())
          : undefined;
        const matched = matchedById ?? matchedBySku ?? matchedByName;

        if (matched) {
          if (
            line.product_id === matched.id &&
            line.product_sku === matched.sku &&
            line.product_name === matched.name
          ) {
            return line;
          }
          return {
            ...line,
            product_id: matched.id,
            product_sku: matched.sku,
            product_name: matched.name,
          } satisfies InvoiceLineDraft;
        }

        if (line.product_id == null) return line;

        return {
          ...line,
          product_id: undefined,
        } satisfies InvoiceLineDraft;
      });

      const changed = items.some((item, index) => item !== baseDraft.items[index]);
      if (!changed) return baseDraft;
      return withValidation({ ...baseDraft, items });
    },
    [productLookup],
  );

  const resetState = () => {
    setDraft(null);
    setResult(null);
    setMessage(null);
    setLastParsedFile(null);
  };

  const analyse = async (sourceFile?: File | null) => {
    const targetFile = sourceFile ?? file;
    if (!targetFile) return;
    setParsing(true);
    setMessage(null);

    try {
      const parsed = await parsePdfInvoice({
        supplier,
        file: targetFile,
        invoiceNoOverride: invoiceNo || undefined,
        invoiceDateOverride: invDate || undefined,
      });

      const isReanalyse = lastParsedFile != null && targetFile === lastParsedFile;
      const parsedInvoiceNo = parsed.invoice_no || "";
      const parsedInvoiceDate = parsed.invoice_date || "";

      const nextInvoiceNo = !isReanalyse || !invoiceNo ? parsedInvoiceNo || invoiceNo : invoiceNo;
      const nextInvoiceDate = !isReanalyse || !invDate ? parsedInvoiceDate || invDate : invDate;

      if (!isReanalyse || !invoiceNo) setInvoiceNo(nextInvoiceNo);
      if (!isReanalyse || !invDate) setInvDate(nextInvoiceDate);

      const adjusted = cloneDraft(parsed);
      adjusted.supplier = supplier;
      adjusted.invoice_no = nextInvoiceNo;
      adjusted.invoice_date = nextInvoiceDate;
      const validated = withValidation(adjusted);
      const assigned = assignProducts(validated);

      setDraft(assigned);
      setLastParsedFile(targetFile);
      setMessage({ text: "Parser-Ergebnis aktualisiert. Bitte prüfen.", tone: "info" });
    } catch (error) {
      setDraft(null);
      setMessage({ text: (error as Error).message, tone: "danger" });
    } finally {
      setParsing(false);
    }
  };

  useEffect(() => {
    if (!draft) return;
    const next = assignProducts(draft);
    if (next !== draft) {
      setDraft(next);
    }
  }, [assignProducts, draft]);

  const updateLine = (index: number, partial: Partial<InvoiceLineDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneDraft(prev);
      const current = next.items[index];
      const qtyValue = partial.qty ?? current.qty;
      const unitPriceValue = partial.unit_price_net ?? current.unit_price_net;
      const taxValue = partial.tax_rate_percent ?? current.tax_rate_percent;
      const productIdValue =
        partial.product_id !== undefined ? partial.product_id ?? undefined : current.product_id;
      const updated: InvoiceLineDraft = {
        ...current,
        ...partial,
        qty: Number.isFinite(qtyValue) ? qtyValue : 0,
        unit_price_net: Number.isFinite(unitPriceValue) ? unitPriceValue : 0,
        tax_rate_percent: Number.isFinite(taxValue) ? taxValue : current.tax_rate_percent,
        line_type: partial.line_type ?? current.line_type,
        uom: partial.uom ?? current.uom,
        product_name: partial.product_name ?? current.product_name,
        product_sku: partial.product_sku ?? current.product_sku,
        product_id: productIdValue,
      };
      if (updated.line_type !== "product") {
        updated.product_id = undefined;
      }
      next.items[index] = updated;
      return withValidation(next);
    });
  };

  const handleProductSelect = (index: number, productId: number | null) => {
    if (productId == null) {
      updateLine(index, { product_id: undefined });
      return;
    }
    const product = productLookup.byId.get(productId);
    if (!product) {
      updateLine(index, { product_id: undefined });
      return;
    }
    updateLine(index, {
      product_id: product.id,
      product_sku: product.sku,
      product_name: product.name,
    });
  };

  const submit = async () => {
    if (!draft) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const sess = (await supabase.auth.getSession()).data.session;
      const payload = {
        mode: "finalize",
        supplier: draft.supplier,
        source: "pdf" as const,
        options: { allocate_surcharges: alloc },
        draft: withValidation(draft),
      };

      const res = await fetch(`${functionsUrl}/import-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage({ text: errorText || "Import fehlgeschlagen.", tone: "danger" });
        setResult(null);
      } else {
        const json = (await res.json()) as Record<string, unknown>;
        setResult(json);
        setMessage({ text: "Rechnung wurde gebucht.", tone: "success" });
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
        <p>PDF hochladen, Parser prüfen lassen und mit wenigen Klicks buchen.</p>
      </header>

      <section className="card">
        <h2 className="section-title">Import vorbereiten</h2>
        <div className="form-grid two-columns import-grid">
          <label>
            <span>Lieferant</span>
            <select
              value={supplier}
              onChange={(event) => {
                const value = event.target.value;
                setSupplier(value);
                setDraft((prev) => (prev ? { ...prev, supplier: value } : prev));
              }}
            >
              {SUPPLIER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Umlage</span>
            <select value={alloc} onChange={(event) => setAlloc(event.target.value as typeof alloc)}>
              <option value="none">Keine</option>
              <option value="per_kg">Pro Kilogramm</option>
              <option value="per_piece">Pro Stück</option>
            </select>
          </label>
          <label className="import-grid__file">
            <span>PDF-Datei</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) {
                  resetState();
                  setInvoiceNo("");
                  setInvDate("");
                }
              }}
            />
          </label>
        </div>
        <div className="meta-panel">
          <h3 className="meta-panel__title">Rechnungsdetails</h3>
          <div className="meta-panel__grid">
            <label className="meta-panel__control">
              <span>Rechnungsnummer</span>
              <input
                value={invoiceNo}
                onChange={(event) => {
                  const value = event.target.value;
                  setInvoiceNo(value);
                  setDraft((prev) => (prev ? { ...prev, invoice_no: value } : prev));
                }}
              />
            </label>
            <label className="meta-panel__control">
              <span>Rechnungsdatum</span>
              <input
                type="date"
                value={invDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setInvDate(value);
                  setDraft((prev) => (prev ? { ...prev, invoice_date: value } : prev));
                }}
              />
            </label>
            {draft?.meta?.length ? (
              draft.meta.map((field) => (
                <div key={field.key} className="meta-panel__field">
                  <span className="meta-panel__label">{field.label}</span>
                  <input value={field.value} readOnly />
                </div>
              ))
            ) : (
              <p className="meta-panel__empty">PDF analysieren, um weitere Kopfdaten zu laden.</p>
            )}
          </div>
        </div>
        <div className="wizard-actions">
          <button type="button" className="btn" onClick={() => analyse()} disabled={!file || parsing}>
            {parsing ? "Analysiere…" : "PDF analysieren"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => analyse(lastParsedFile)}
            disabled={!lastParsedFile || parsing}
          >
            Neu analysieren
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

      {draft && (
        <section className="card card--shadow-strong">
          <header className="review-header">
            <div>
              <h2 className="section-title">Review & Bestätigung</h2>
              <p className="section-subtitle">
                Parser: {draft.parser.template} · Version {draft.parser.version}
                {draft.parser.usedOcr ? " · OCR-Fallback aktiv" : ""}
              </p>
            </div>
            <div className="totals">
              <div>
                <span className="totals__label">Netto</span>
                <span className="totals__value">{draft.totals.net.toFixed(2)} €</span>
              </div>
              <div>
                <span className="totals__label">Steuer</span>
                <span className="totals__value">{draft.totals.tax.toFixed(2)} €</span>
              </div>
              <div>
                <span className="totals__label">Brutto</span>
                <span className="totals__value">{draft.totals.gross.toFixed(2)} €</span>
              </div>
              {draft.totals.reportedGross && (
                <div>
                  <span className="totals__label">Rechnungsbetrag</span>
                  <span className="totals__value">{draft.totals.reportedGross.toFixed(2)} €</span>
                </div>
              )}
              {draft.totals.variancePercent != null && (
                <div>
                  <span className="totals__label">Abweichung</span>
                  <span
                    className={`totals__value ${
                      draft.totals.variancePercent > 0.5 ? "totals__value--alert" : ""
                    }`}
                  >
                    {draft.totals.variancePercent.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </header>

          {(draft.parser.warnings.length > 0 || draft.warnings.length > 0) && (
            <div className="callout callout--info">
              <strong>Hinweise:</strong>
              <ul>
                {[...draft.parser.warnings, ...draft.warnings].map((warn, idx) => (
                  <li key={idx}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {productError && (
            <div className="callout callout--danger">
              Produkte konnten nicht geladen werden: {productError}
            </div>
          )}
          {!loadingProducts && !productOptions.length && !productError && (
            <div className="callout callout--info">
              Es sind keine aktiven Produkte verfügbar. Legen Sie zunächst Artikel im Bereich{" "}
              <strong>Produkte</strong> an.
            </div>
          )}

          <div className="table-wrapper">
            <table className="review-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Produkt</th>
                  <th>SKU</th>
                  <th>Produktname</th>
                  <th>Menge</th>
                  <th>Einheit</th>
                  <th>Einzelpreis (€)</th>
                  <th>Netto (€)</th>
                  <th>Steuer %</th>
                  <th>Typ</th>
                  <th>Confidence</th>
                  <th>Hinweise</th>
                </tr>
              </thead>
              <tbody>
                {draft.items.map((line, index) => (
                  <tr
                    key={line.line_no}
                    className={
                      line.confidence < 0.6
                        ? "row-status--critical"
                        : line.issues.length > 0 || line.confidence < 0.75
                          ? "row-status--warning"
                          : undefined
                    }
                  >
                    <td>{line.line_no}</td>
                    <td>
                      {line.line_type === "product" ? (
                        <div className="review-product-cell">
                          <select
                            value={line.product_id != null ? String(line.product_id) : ""}
                            onChange={(event) =>
                              handleProductSelect(
                                index,
                                event.target.value ? Number.parseInt(event.target.value, 10) : null,
                              )
                            }
                            disabled={loadingProducts || !productOptions.length}
                            required={productOptions.length > 0 && line.line_type === "product"}
                          >
                            <option value="" disabled>
                              {loadingProducts ? "Produkte laden…" : "Produkt wählen"}
                            </option>
                            {productOptions.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.sku ? `${product.sku} · ${product.name}` : product.name}
                              </option>
                            ))}
                          </select>
                          {!line.product_id && (line.product_sku || line.product_name) ? (
                            <div className="review-product-hint">
                              Parser: {line.product_sku ? `${line.product_sku} · ` : ""}
                              {line.product_name ?? ""}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="review-product-placeholder">–</span>
                      )}
                    </td>
                    <td>
                      {line.line_type === "product" ? (
                        <div className="review-readonly">{line.product_sku ?? "—"}</div>
                      ) : (
                        <input
                          value={line.product_sku ?? ""}
                          onChange={(event) =>
                            updateLine(index, { product_sku: event.target.value || undefined })
                          }
                        />
                      )}
                    </td>
                    <td>
                      {line.line_type === "product" ? (
                        <div className="review-readonly">{line.product_name ?? "—"}</div>
                      ) : (
                        <input
                          value={line.product_name ?? ""}
                          onChange={(event) =>
                            updateLine(index, { product_name: event.target.value || undefined })
                          }
                        />
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={line.qty}
                        onChange={(event) => updateLine(index, { qty: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        value={line.uom}
                        onChange={(event) => updateLine(index, { uom: event.target.value as InvoiceLineDraft["uom"] })}
                      >
                        {ALLOWED_UOMS.map((uom) => (
                          <option key={uom} value={uom}>
                            {uom}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={line.unit_price_net}
                        onChange={(event) => updateLine(index, { unit_price_net: Number(event.target.value) })}
                      />
                    </td>
                    <td>{line.line_total_net.toFixed(2)}</td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={line.tax_rate_percent}
                        onChange={(event) => updateLine(index, { tax_rate_percent: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        value={line.line_type}
                        onChange={(event) =>
                          updateLine(index, {
                            line_type: event.target.value as InvoiceLineDraft["line_type"],
                          })
                        }
                      >
                        <option value="product">Produkt</option>
                        <option value="surcharge">Zuschlag</option>
                        <option value="shipping">Versand</option>
                      </select>
                    </td>
                    <td>
                      <span className={confidenceClass(line.confidence)}>
                        {(line.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td>
                      {line.issues.length ? (
                        <ul className="issues-list">
                          {line.issues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="issues-list__ok">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="review-footer">
            {hasUnsureLines && (
              <p className="review-hint">Gelb markierte Zeilen bitte prüfen – fehlende Zuordnung oder geringe Sicherheit.</p>
            )}
            <div className="review-actions">
              <button type="button" className="btn btn--ghost" onClick={resetState}>
                Zurücksetzen
              </button>
              <button
                type="button"
                className="btn"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? "Buchen…" : "Bestätigen & buchen"}
              </button>
            </div>
          </footer>
        </section>
      )}

      {result && (
        <section className="card card--shadow-strong">
          <h2 className="section-title">Ergebnis</h2>
          <div className="preformatted">{JSON.stringify(result, null, 2)}</div>
        </section>
      )}
    </div>
  );
}
