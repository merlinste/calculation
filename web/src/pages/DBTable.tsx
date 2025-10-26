import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSupplierOptions } from "../lib/useSupplierOptions";
import { useProductOptions } from "../lib/useProductOptions";

type MetricRow = {
  product_id: number;
  channel: string;
  sales_price_net_per_unit: number | null;
  purchase_cost_net_per_unit: number | null;
  dbi: number | null;
  db_margin: number | null;
};

type InvoiceSummary = {
  id: number;
  supplierId: number | null;
  supplierName: string;
  invoiceNo: string;
  invoiceDate: string | null;
  currency: string;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
};

type EditableInvoice = {
  id: number;
  supplierId: number | null;
  invoiceNo: string;
  invoiceDate: string;
  currency: string;
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
};

type EditableItem = {
  clientId: string;
  id: number | null;
  productId: number | null;
  lineType: "product" | "surcharge" | "shipping";
  qty: string;
  uom: string;
  unitPriceNet: string;
  discountAbs: string;
  taxRate: string;
  notes: string;
  sourceProductLabel: string | null;
};

const lineTypeLabels: Record<EditableItem["lineType"], string> = {
  product: "Produkt",
  surcharge: "Aufschlag",
  shipping: "Versand",
};

const formatNumberInput = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
};

const parseDecimal = (value: string) => {
  if (!value) return 0;
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createEmptyItem = (clientId: string): EditableItem => ({
  clientId,
  id: null,
  productId: null,
  lineType: "product",
  qty: "",
  uom: "",
  unitPriceNet: "",
  discountAbs: "",
  taxRate: "",
  notes: "",
  sourceProductLabel: null,
});

export default function DBTable() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [metricError, setMetricError] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<EditableInvoice | null>(null);
  const [invoiceFormPristine, setInvoiceFormPristine] = useState(true);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceFeedback, setInvoiceFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [items, setItems] = useState<EditableItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [savingItems, setSavingItems] = useState(false);
  const [itemsFeedback, setItemsFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [removedItemIds, setRemovedItemIds] = useState<number[]>([]);
  const [itemCounter, setItemCounter] = useState(0);

  const { suppliers } = useSupplierOptions();
  const { products } = useProductOptions();

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      }),
    [],
  );

  const percent = useMemo(
    () =>
      new Intl.NumberFormat("de-DE", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
      }),
    [],
  );

  const loadMetrics = useCallback(async () => {
    const { data, error } = await supabase.from("product_dbi_current").select("*").order("product_id");
    if (error) {
      setMetricError(error.message);
      setMetrics([]);
    } else {
      setMetricError(null);
      setMetrics((data as MetricRow[]) || []);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    setInvoicesError(null);
    const { data, error } = await supabase
      .from("purchase_invoices")
      .select("id, supplier_id, invoice_no, invoice_date, currency, net_amount, tax_amount, gross_amount, suppliers(name)")
      .order("invoice_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      setInvoicesError(error.message);
      setInvoices([]);
    } else {
      const list = (data ?? []).map((item) => ({
        id: item.id as number,
        supplierId: (item.supplier_id as number | null | undefined) ?? null,
        supplierName: (item.suppliers?.name as string | undefined) ?? "Unbekannt",
        invoiceNo: (item.invoice_no as string | undefined) ?? "",
        invoiceDate: (item.invoice_date as string | null | undefined) ?? null,
        currency: (item.currency as string | undefined) ?? "EUR",
        netAmount: Number(item.net_amount) || 0,
        taxAmount: Number(item.tax_amount) || 0,
        grossAmount: Number(item.gross_amount) || 0,
      }));
      setInvoices(list);
    }

    setInvoicesLoading(false);
  }, []);

  const loadInvoiceItems = useCallback(async (invoiceId: number) => {
    setItemsLoading(true);
    setItemsError(null);
    const { data, error } = await supabase
      .from("purchase_invoice_items")
      .select("id, invoice_id, product_id, line_type, qty, uom, unit_price_net, discount_abs, tax_rate, notes, products(name, sku)")
      .eq("invoice_id", invoiceId)
      .order("id", { ascending: true });

    if (error) {
      setItemsError(error.message);
      setItems([]);
    } else {
      const mapped = (data ?? []).map((row) => ({
        clientId: `existing-${row.id as number}`,
        id: row.id as number,
        productId: (row.product_id as number | null | undefined) ?? null,
        lineType: (row.line_type as EditableItem["lineType"] | undefined) ?? "product",
        qty: formatNumberInput(row.qty as number | null | undefined),
        uom: (row.uom as string | null | undefined) ?? "",
        unitPriceNet: formatNumberInput(row.unit_price_net as number | null | undefined),
        discountAbs: formatNumberInput(row.discount_abs as number | null | undefined),
        taxRate: formatNumberInput(row.tax_rate as number | null | undefined),
        notes: (row.notes as string | null | undefined) ?? "",
        sourceProductLabel: row.products
          ? `${(row.products.sku as string | undefined) ?? ""} ${(row.products.name as string | undefined) ?? ""}`.trim() || null
          : null,
      }));
      setItems(mapped);
      setRemovedItemIds([]);
    }

    setItemsLoading(false);
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (!invoices.length) {
      setSelectedInvoiceId(null);
      return;
    }
    setSelectedInvoiceId((current) => {
      if (current && invoices.some((invoice) => invoice.id === current)) {
        return current;
      }
      return invoices[0]?.id ?? null;
    });
  }, [invoices]);

  useEffect(() => {
    if (selectedInvoiceId == null) {
      setInvoiceForm(null);
      setItems([]);
      return;
    }

    const summary = invoices.find((invoice) => invoice.id === selectedInvoiceId);
    if (!summary) {
      setInvoiceForm(null);
      setItems([]);
      return;
    }

    if (invoiceFormPristine) {
      setInvoiceForm({
        id: summary.id,
        supplierId: summary.supplierId,
        invoiceNo: summary.invoiceNo,
        invoiceDate: summary.invoiceDate ?? "",
        currency: summary.currency || "EUR",
        netAmount: formatNumberInput(summary.netAmount),
        taxAmount: formatNumberInput(summary.taxAmount),
        grossAmount: formatNumberInput(summary.grossAmount),
      });
    }

    setItemCounter(0);
    void loadInvoiceItems(summary.id);
  }, [selectedInvoiceId, invoices, invoiceFormPristine, loadInvoiceItems]);

  const renderCurrency = (value: number | null) => {
    if (value == null) return "–";
    return currency.format(value);
  };

  const renderPercent = (value: number | null) => {
    if (value == null) return "–";
    return percent.format(value);
  };

  const handleSelectInvoice = (invoiceId: number) => {
    setInvoiceFormPristine(true);
    setSelectedInvoiceId(invoiceId);
    setInvoiceFeedback(null);
    setItemsFeedback(null);
  };

  const updateInvoiceForm = <K extends keyof EditableInvoice>(key: K, value: EditableInvoice[K]) => {
    setInvoiceForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setInvoiceFormPristine(false);
    setInvoiceFeedback(null);
  };

  const updateItem = <K extends keyof EditableItem>(clientId: string, key: K, value: EditableItem[K]) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.clientId !== clientId) return item;
        const next: EditableItem = { ...item, [key]: value };
        if (key === "lineType" && value !== "product") {
          next.productId = null;
        }
        return next;
      }),
    );
    setItemsFeedback(null);
  };

  const addItem = () => {
    const id = `new-${itemCounter + 1}`;
    setItemCounter((counter) => counter + 1);
    setItems((prev) => [...prev, createEmptyItem(id)]);
    setItemsFeedback(null);
  };

  const removeItem = (clientId: string) => {
    setItems((prev) => {
      const item = prev.find((entry) => entry.clientId === clientId);
      if (item?.id != null) {
        setRemovedItemIds((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]));
      }
      return prev.filter((entry) => entry.clientId !== clientId);
    });
    setItemsFeedback(null);
  };

  const saveInvoice = async () => {
    if (!invoiceForm) return;
    if (!invoiceForm.supplierId) {
      setInvoiceFeedback({ type: "error", message: "Bitte wählen Sie einen Lieferanten." });
      return;
    }
    if (!invoiceForm.invoiceNo.trim()) {
      setInvoiceFeedback({ type: "error", message: "Bitte geben Sie eine Rechnungsnummer ein." });
      return;
    }

    const netAmount = parseDecimal(invoiceForm.netAmount);
    const taxAmount = parseDecimal(invoiceForm.taxAmount);
    const grossAmount = parseDecimal(invoiceForm.grossAmount);

    setSavingInvoice(true);
    setInvoiceFeedback(null);

    const { error } = await supabase
      .from("purchase_invoices")
      .update({
        supplier_id: invoiceForm.supplierId,
        invoice_no: invoiceForm.invoiceNo,
        invoice_date: invoiceForm.invoiceDate ? invoiceForm.invoiceDate : null,
        currency: invoiceForm.currency || "EUR",
        net_amount: netAmount,
        tax_amount: taxAmount,
        gross_amount: grossAmount,
      })
      .eq("id", invoiceForm.id);

    if (error) {
      setInvoiceFeedback({ type: "error", message: error.message });
    } else {
      setInvoiceFeedback({ type: "success", message: "Rechnungsdaten gespeichert." });
      setInvoiceFormPristine(true);
      await loadInvoices();
    }

    setSavingInvoice(false);
  };

  const saveItems = async () => {
    if (!selectedInvoiceId) return;
    if (!items.length && !removedItemIds.length) {
      setItemsFeedback({ type: "error", message: "Bitte erfassen Sie mindestens eine Position." });
      return;
    }

    const prepared = items.map((item) => ({
      id: item.id,
      invoice_id: selectedInvoiceId,
      product_id: item.lineType === "product" ? item.productId : null,
      line_type: item.lineType,
      qty: parseDecimal(item.qty),
      uom: item.uom || null,
      unit_price_net: parseDecimal(item.unitPriceNet),
      discount_abs: parseDecimal(item.discountAbs),
      tax_rate: parseDecimal(item.taxRate),
      notes: item.notes || null,
    }));

    const invalidProduct = prepared.some((item, index) => items[index]?.lineType === "product" && !item.product_id);
    if (invalidProduct) {
      setItemsFeedback({ type: "error", message: "Produktpositionen benötigen eine Produktzuordnung." });
      return;
    }

    setSavingItems(true);
    setItemsFeedback(null);

    try {
      const existingRecords = prepared.filter((item) => item.id != null);
      const newRecords = prepared.filter((item) => item.id == null);

      if (existingRecords.length) {
        const { error } = await supabase.from("purchase_invoice_items").upsert(existingRecords);
        if (error) throw new Error(error.message);
      }

      if (newRecords.length) {
        const sanitized = newRecords.map(({ id: _id, ...rest }) => rest);
        const { error } = await supabase.from("purchase_invoice_items").insert(sanitized);
        if (error) throw new Error(error.message);
      }

      if (removedItemIds.length) {
        const { error } = await supabase.from("purchase_invoice_items").delete().in("id", removedItemIds);
        if (error) throw new Error(error.message);
      }

      setItemsFeedback({ type: "success", message: "Positionen gespeichert." });
      setRemovedItemIds([]);
      await loadInvoiceItems(selectedInvoiceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setItemsFeedback({ type: "error", message });
    }

    setSavingItems(false);
  };

  const invoiceTotals = useMemo(() => {
    const totals = items.map((item) => {
      const qty = parseDecimal(item.qty);
      const unitPrice = parseDecimal(item.unitPriceNet);
      const discount = parseDecimal(item.discountAbs);
      return qty * unitPrice - discount;
    });
    return totals.reduce((sum, value) => sum + value, 0);
  }, [items]);

  const activeInvoiceSummary = useMemo(
    () =>
      selectedInvoiceId != null
        ? invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null
        : null,
    [invoices, selectedInvoiceId],
  );

  const activeSupplierName = activeInvoiceSummary?.supplierName ?? null;
  const activeInvoiceUpdatedAt = activeInvoiceSummary?.updatedAt ?? null;
  const invoiceFormDate = invoiceForm?.invoiceDate ?? null;

  const invoiceDateDisplay = useMemo(() => {
    if (!invoiceFormDate) return null;
    const parsed = new Date(invoiceFormDate);
    if (Number.isNaN(parsed.getTime())) return null;
    return dateFormatter.format(parsed);
  }, [invoiceFormDate, dateFormatter]);

  const updatedAtDisplay = useMemo(() => {
    if (!activeInvoiceUpdatedAt) return null;
    const parsed = new Date(activeInvoiceUpdatedAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return dateFormatter.format(parsed);
  }, [activeInvoiceUpdatedAt, dateFormatter]);

  const invoiceMetaLine = useMemo(() => {
    if (!invoiceForm) return null;
    const parts: string[] = [];
    parts.push(activeSupplierName ?? "Unbekannter Lieferant");
    if (invoiceForm.invoiceNo.trim()) {
      parts.push(invoiceForm.invoiceNo.trim());
    }
    if (invoiceDateDisplay) {
      parts.push(invoiceDateDisplay);
    }
    return parts.join(" · ");
  }, [invoiceForm, activeSupplierName, invoiceDateDisplay]);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Datenbank</h1>
        <p>Alle Einkaufsrechnungen und Kalkulationskennzahlen auf einen Blick – inklusive manueller Anpassungen.</p>
      </header>

      <section className="card">
        <h2 className="section-title">Kennzahlen (Produkt-Deckungsbeiträge)</h2>
        {metricError ? <p className="alert alert--error">{metricError}</p> : null}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Kanal</th>
                <th>VK netto</th>
                <th>Ø EK (90 Tage)</th>
                <th>DB I</th>
                <th>DB-Quote</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((row) => (
                <tr key={`${row.product_id}-${row.channel}`}>
                  <td>{row.product_id}</td>
                  <td>{row.channel}</td>
                  <td>{renderCurrency(row.sales_price_net_per_unit)}</td>
                  <td>{renderCurrency(row.purchase_cost_net_per_unit)}</td>
                  <td>{renderCurrency(row.dbi)}</td>
                  <td>{renderPercent(row.db_margin)}</td>
                </tr>
              ))}
              {!metrics.length ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Keine Kennzahlen vorhanden.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Einkaufsrechnungen</h2>
        {invoicesError ? <p className="alert alert--error">{invoicesError}</p> : null}
        <div className="invoice-layout">
          <div className="invoice-layout__list">
            <div className="table-scroll">
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>Lieferant</th>
                    <th>Rechnungsnummer</th>
                    <th>Datum</th>
                    <th>Netto</th>
                    <th>Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesLoading ? (
                    <tr>
                      <td colSpan={5} className="table-empty">
                        Lade Rechnungen…
                      </td>
                    </tr>
                  ) : null}
                  {!invoicesLoading && !invoices.length ? (
                    <tr>
                      <td colSpan={5} className="table-empty">
                        Noch keine Rechnungen vorhanden.
                      </td>
                    </tr>
                  ) : null}
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className={invoice.id === selectedInvoiceId ? "table-row--active" : undefined}
                      onClick={() => handleSelectInvoice(invoice.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelectInvoice(invoice.id);
                        }
                      }}
                    >
                      <td>{invoice.supplierName}</td>
                      <td>{invoice.invoiceNo}</td>
                      <td>{invoice.invoiceDate ?? "–"}</td>
                      <td>{renderCurrency(invoice.netAmount)}</td>
                      <td>{renderCurrency(invoice.grossAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="invoice-layout__detail">
            {invoiceForm ? (
              <>
                <header className="invoice-detail__header">
                  <div>
                    <h3 className="invoice-detail__title">Rechnung bearbeiten</h3>
                    {invoiceMetaLine ? <p className="invoice-detail__meta">{invoiceMetaLine}</p> : null}
                  </div>
                  {updatedAtDisplay ? (
                    <span className="invoice-detail__status">Aktualisiert am {updatedAtDisplay}</span>
                  ) : null}
                </header>
                <form
                  className="invoice-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveInvoice();
                  }}
                >
                  <div className="form-field">
                    <label htmlFor="invoice-supplier">Lieferant</label>
                    <select
                      id="invoice-supplier"
                      value={invoiceForm.supplierId ?? ""}
                      onChange={(event) => updateInvoiceForm("supplierId", event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">Lieferant auswählen…</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="invoice-number">Rechnungsnummer</label>
                    <input
                      id="invoice-number"
                      type="text"
                      value={invoiceForm.invoiceNo}
                      onChange={(event) => updateInvoiceForm("invoiceNo", event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="invoice-date">Rechnungsdatum</label>
                    <input
                      id="invoice-date"
                      type="date"
                      value={invoiceForm.invoiceDate}
                      onChange={(event) => updateInvoiceForm("invoiceDate", event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="invoice-currency">Währung</label>
                    <input
                      id="invoice-currency"
                      type="text"
                      value={invoiceForm.currency}
                      onChange={(event) => updateInvoiceForm("currency", event.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="invoice-net">Netto</label>
                    <input
                      id="invoice-net"
                      type="text"
                      inputMode="decimal"
                      value={invoiceForm.netAmount}
                      onChange={(event) => updateInvoiceForm("netAmount", event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="invoice-tax">Steuer</label>
                    <input
                      id="invoice-tax"
                      type="text"
                      inputMode="decimal"
                      value={invoiceForm.taxAmount}
                      onChange={(event) => updateInvoiceForm("taxAmount", event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="invoice-gross">Brutto</label>
                    <input
                      id="invoice-gross"
                      type="text"
                      inputMode="decimal"
                      value={invoiceForm.grossAmount}
                      onChange={(event) => updateInvoiceForm("grossAmount", event.target.value)}
                    />
                  </div>
                </form>
                {invoiceFeedback ? (
                  <p className={`alert alert--${invoiceFeedback.type}`}>{invoiceFeedback.message}</p>
                ) : null}
                <div className="form-actions">
                  <button type="button" className="btn" onClick={() => void saveInvoice()} disabled={savingInvoice}>
                    {savingInvoice ? "Speichern…" : "Rechnung speichern"}
                  </button>
                </div>

                <div className="detail-section">
                  <header className="detail-section__header">
                    <h3>Positionen</h3>
                    <div className="detail-section__actions">
                      <button type="button" className="btn btn--ghost" onClick={addItem}>
                        + Position hinzufügen
                      </button>
                    </div>
                  </header>
                  {itemsError ? <p className="alert alert--error">{itemsError}</p> : null}
                  <div className="table-scroll">
                    <table className="data-table data-table--compact">
                      <thead>
                        <tr>
                          <th>Typ</th>
                          <th>Produkt</th>
                          <th>Menge</th>
                          <th>Einheit</th>
                          <th>EK netto</th>
                          <th>Rabatt</th>
                          <th>Steuer</th>
                          <th>Gesamt</th>
                          <th>Notiz</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsLoading ? (
                          <tr>
                            <td colSpan={10} className="table-empty">
                              Lade Positionen…
                            </td>
                          </tr>
                        ) : null}
                        {!itemsLoading && !items.length ? (
                          <tr>
                            <td colSpan={10} className="table-empty">
                              Keine Positionen vorhanden.
                            </td>
                          </tr>
                        ) : null}
                        {items.map((item) => {
                          const qty = parseDecimal(item.qty);
                          const unitPrice = parseDecimal(item.unitPriceNet);
                          const discount = parseDecimal(item.discountAbs);
                          const total = qty * unitPrice - discount;
                          return (
                            <tr key={item.clientId}>
                              <td>
                                <select
                                  value={item.lineType}
                                  onChange={(event) =>
                                    updateItem(item.clientId, "lineType", event.target.value as EditableItem["lineType"])
                                  }
                                >
                                  {Object.entries(lineTypeLabels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={item.productId ?? ""}
                                  onChange={(event) =>
                                    updateItem(
                                      item.clientId,
                                      "productId",
                                      event.target.value ? Number(event.target.value) : null,
                                    )
                                  }
                                  disabled={item.lineType !== "product"}
                                >
                                  <option value="">
                                    {item.lineType === "product"
                                      ? "Produkt auswählen…"
                                      : item.sourceProductLabel || "Nicht benötigt"}
                                  </option>
                                  {products.map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {product.sku} – {product.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.qty}
                                  onChange={(event) => updateItem(item.clientId, "qty", event.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={item.uom}
                                  onChange={(event) => updateItem(item.clientId, "uom", event.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.unitPriceNet}
                                  onChange={(event) => updateItem(item.clientId, "unitPriceNet", event.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.discountAbs}
                                  onChange={(event) => updateItem(item.clientId, "discountAbs", event.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.taxRate}
                                  onChange={(event) => updateItem(item.clientId, "taxRate", event.target.value)}
                                />
                              </td>
                              <td>{renderCurrency(Number.isFinite(total) ? total : 0)}</td>
                              <td>
                                <input
                                  type="text"
                                  value={item.notes}
                                  onChange={(event) => updateItem(item.clientId, "notes", event.target.value)}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  onClick={() => removeItem(item.clientId)}
                                >
                                  Entfernen
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <footer className="detail-section__footer">
                    <div className="detail-section__totals">
                      <span className="detail-section__totals-label">Summe Positionen:</span>
                      <span className="detail-section__totals-value">{renderCurrency(invoiceTotals)}</span>
                    </div>
                    {itemsFeedback ? (
                      <p className={`alert alert--${itemsFeedback.type}`}>{itemsFeedback.message}</p>
                    ) : null}
                    <div className="form-actions">
                      <button type="button" className="btn" onClick={() => void saveItems()} disabled={savingItems}>
                        {savingItems ? "Speichern…" : "Positionen speichern"}
                      </button>
                    </div>
                  </footer>
                </div>
              </>
            ) : (
              <p className="invoice-detail__empty">Bitte wählen Sie eine Rechnung aus.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
