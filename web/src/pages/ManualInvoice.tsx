import { FormEvent, useMemo, useState } from "react";
import { useProductOptions } from "../lib/useProductOptions";
import { useSupplierOptions } from "../lib/useSupplierOptions";
import { supabase } from "../lib/supabase";

type LineItem = {
  id: string;
  productId: number | null;
  quantity: string;
  unit: string;
  price: string;
};

const createLineItem = (id: number): LineItem => ({
  id: `line-${id}`,
  productId: null,
  quantity: "",
  unit: "",
  price: "",
});

export default function ManualInvoice() {
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([createLineItem(0)]);
  const [nextId, setNextId] = useState(1);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);

  type ProductDetail = {
    id: number;
    base_uom: "piece" | "kg";
    pieces_per_TU: number | null;
  };

  type NormalizedUom = "KG" | "STUECK" | "TU";

  const parseDecimal = (value: string): number => {
    if (!value) return 0;
    const normalized = value.replace(/\s+/g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeUom = (value: string): NormalizedUom | null => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    if (["kg", "kilogram", "kilogramm"].includes(trimmed)) return "KG";
    if (["stk", "st", "stueck", "stück", "piece", "pcs", "pc"].includes(trimmed)) return "STUECK";
    if (["tu", "karton", "case", "tray"].includes(trimmed)) return "TU";
    return null;
  };

  const computeBaseConversion = (
    product: ProductDetail | undefined,
    quantity: number,
    unitPrice: number,
    unit: NormalizedUom | null,
  ): { qtyBase: number; pricePerBaseUnit: number } | null => {
    if (!product) return null;
    if (product.base_uom === "kg") {
      if (unit === "KG" || unit === null) {
        return { qtyBase: quantity, pricePerBaseUnit: unitPrice };
      }
      return null;
    }

    if (product.base_uom === "piece") {
      if (unit === "STUECK" || unit === null) {
        return { qtyBase: quantity, pricePerBaseUnit: unitPrice };
      }
      if (unit === "TU" && product.pieces_per_TU && product.pieces_per_TU > 0) {
        const qtyBase = quantity * product.pieces_per_TU;
        if (!qtyBase) return null;
        return { qtyBase, pricePerBaseUnit: unitPrice / product.pieces_per_TU };
      }
      return null;
    }

    return null;
  };
  const { products, loading: loadingProducts, error: productsError } = useProductOptions();
  const {
    suppliers,
    loading: loadingSuppliers,
    error: suppliersError,
  } = useSupplierOptions();

  const productMap = useMemo(() => {
    const map = new Map<number, { id: number; name: string; sku: string }>();
    products.forEach((product) => {
      map.set(product.id, { id: product.id, name: product.name, sku: product.sku });
    });
    return map;
  }, [products]);

  const supplierMap = useMemo(() => {
    const map = new Map<number, { id: number; name: string }>();
    suppliers.forEach((supplier) => {
      map.set(supplier.id, { id: supplier.id, name: supplier.name });
    });
    return map;
  }, [suppliers]);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }),
    [],
  );

  const updateLineItem = <K extends keyof LineItem>(id: string, key: K, value: LineItem[K]) => {
    setLineItems((items) => items.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const addLineItem = () => {
    setLineItems((items) => [...items, createLineItem(nextId)]);
    setNextId((id) => id + 1);
  };

  const removeLineItem = (id: string) => {
    setLineItems((items) => (items.length === 1 ? items : items.filter((item) => item.id !== id)));
  };

  const totals = useMemo(() => {
    return lineItems.map((item) => {
      const quantity = parseDecimal(item.quantity);
      const price = parseDecimal(item.price);
      return quantity * price;
    });
  }, [lineItems]);

  const grandTotal = useMemo(
    () => totals.reduce((sum, value) => sum + value, 0),
    [totals],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supplierId) {
      setErrorMessage("Bitte wählen Sie einen Lieferanten aus.");
      return;
    }

    if (!invoiceNumber.trim()) {
      setErrorMessage("Bitte geben Sie eine Rechnungsnummer an.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setWarningMessages([]);

    const preparedLineItems = lineItems
      .map((item, index) => {
        const quantity = parseDecimal(item.quantity);
        const price = parseDecimal(item.price);
        const product = item.productId != null ? productMap.get(item.productId) : undefined;
        return {
          id: item.id,
          productId: product?.id ?? null,
          quantity,
          price,
          unitRaw: item.unit,
          total: totals[index] ?? quantity * price,
        };
      })
      .filter((item) => item.productId != null && item.quantity > 0 && item.price >= 0);

    if (!preparedLineItems.length) {
      setSaving(false);
      setErrorMessage("Bitte erfassen Sie mindestens eine gültige Position.");
      return;
    }

    const productIds = Array.from(new Set(preparedLineItems.map((item) => item.productId!)));

    try {
      const { data: productDetailsData, error: productDetailsError } = await supabase
        .from("products")
        .select("id, base_uom, pieces_per_TU")
        .in("id", productIds);

      if (productDetailsError) {
        throw new Error(productDetailsError.message);
      }

      const productDetailsMap = new Map<number, ProductDetail>();
      (productDetailsData ?? []).forEach((entry) => {
        const id = entry.id as number;
        const base_uom = (entry.base_uom as ProductDetail["base_uom"]) || "piece";
        const pieces_per_TU = (entry.pieces_per_TU as number | null) ?? null;
        productDetailsMap.set(id, { id, base_uom, pieces_per_TU });
      });

      const invoiceDateValue = invoiceDate || null;
      const effectiveDate = invoiceDate || new Date().toISOString().slice(0, 10);
      const netAmount = preparedLineItems.reduce((sum, item) => sum + item.total, 0);
      const roundedNet = Number(netAmount.toFixed(2));

      const { data: invoiceData, error: invoiceError } = await supabase
        .from("purchase_invoices")
        .insert({
          supplier_id: supplierId,
          invoice_no: invoiceNumber.trim(),
          invoice_date: invoiceDateValue,
          currency: "EUR",
          net_amount: roundedNet,
          tax_amount: 0,
          gross_amount: roundedNet,
        })
        .select("id")
        .single();

      if (invoiceError || !invoiceData) {
        throw new Error(invoiceError?.message ?? "Rechnung konnte nicht gespeichert werden.");
      }

      const invoiceId = invoiceData.id as number;
      const historyWarnings: string[] = [];

      for (const item of preparedLineItems) {
        const normalizedUnit = normalizeUom(item.unitRaw);
        const uomToStore = normalizedUnit ?? (item.unitRaw ? item.unitRaw.trim().toUpperCase() : null);

        const { data: insertedItem, error: itemError } = await supabase
          .from("purchase_invoice_items")
          .insert({
            invoice_id: invoiceId,
            product_id: item.productId,
            line_type: "product",
            qty: item.quantity,
            uom: uomToStore,
            unit_price_net: item.price,
            discount_abs: 0,
            tax_rate: 0,
            notes: null,
          })
          .select("id")
          .single();

        if (itemError || !insertedItem) {
          throw new Error(itemError?.message ?? "Position konnte nicht gespeichert werden.");
        }

        const itemId = insertedItem.id as number;

        const productDetails = productDetailsMap.get(item.productId!);
        const conversion = computeBaseConversion(productDetails, item.quantity, item.price, normalizedUnit);

        if (!productDetails || !conversion) {
          historyWarnings.push(
            `Preis-Historie für Produkt ${productDetails?.id ?? item.productId}: Einheit konnte nicht interpretiert werden.`,
          );
          continue;
        }

        if (!effectiveDate) {
          historyWarnings.push("Kein Rechnungsdatum vorhanden – Preis-Historie wurde übersprungen.");
          continue;
        }

        const { error: historyError } = await supabase.from("purchase_price_history").insert({
          product_id: item.productId,
          date_effective: effectiveDate,
          uom: productDetails.base_uom,
          price_per_base_unit_net: Number(conversion.pricePerBaseUnit.toFixed(4)),
          qty_in_base_units: Number(conversion.qtyBase.toFixed(4)),
          source_item_id: itemId,
        });

        if (historyError) {
          historyWarnings.push(
            `Preis-Historie für Produkt ${item.productId} konnte nicht gespeichert werden: ${historyError.message}`,
          );
        }
      }

      setWarningMessages(historyWarnings);
      setLastSavedAt(new Date());
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Rechnung manuell erfassen</h1>
        <p>
          Erfasse Lieferant, Rechnungsnummer und die einzelnen Positionen einer Rechnung. Die Daten
          werden nach dem Speichern in der Datenbank abgelegt und stehen der Preisentwicklung zur
          Verfügung.
        </p>
      </header>

      <div className="card card--shadow-strong">
        <form className="form-grid" onSubmit={handleSubmit}>
          <section className="form-grid two-columns">
            <label>
              <span>Lieferant</span>
              <select
                value={supplierId != null ? String(supplierId) : ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSupplierId(value ? Number.parseInt(value, 10) : null);
                }}
                disabled={loadingSuppliers || !suppliers.length}
                required={suppliers.length > 0}
              >
                <option value="" disabled>
                  {loadingSuppliers ? "Lade Lieferanten…" : "Lieferant wählen"}
                </option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Rechnungsnummer</span>
              <input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder="z.B. RE-2024-123"
                required
              />
            </label>
            <label>
              <span>Rechnungsdatum</span>
              <input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </label>
          </section>

          <section>
            <h2 className="section-title">Positionen</h2>
            {suppliersError && (
              <div className="callout callout--danger">
                Lieferantenliste konnte nicht geladen werden: {suppliersError}
              </div>
            )}
            {!loadingSuppliers && !suppliers.length && !suppliersError && (
              <div className="callout callout--info">
                Es sind noch keine Lieferanten vorhanden. Legen Sie zuerst Einträge unter <strong>
                  Lieferanten
                </strong>{" "}
                an.
              </div>
            )}
            {productsError && (
              <div className="callout callout--danger">Produktliste konnte nicht geladen werden: {productsError}</div>
            )}
            {!loadingProducts && !products.length && !productsError && (
              <div className="callout callout--info">
                Es sind noch keine aktiven Produkte hinterlegt. Legen Sie zuerst Artikel unter{" "}
                <strong>Produkte</strong> an.
              </div>
            )}
            <div className="table-scroll">
              <table className="data-table invoice-table">
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th>Menge</th>
                    <th>Einheit</th>
                    <th>Preis</th>
                    <th>Zeilensumme</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => {
                    const selectedProduct =
                      item.productId != null ? productMap.get(item.productId) : undefined;
                    return (
                      <tr key={item.id}>
                        <td>
                          <select
                            className="invoice-input"
                            value={item.productId != null ? String(item.productId) : ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              updateLineItem(
                                item.id,
                                "productId",
                                value ? Number.parseInt(value, 10) : null,
                              );
                            }}
                            disabled={loadingProducts || !products.length}
                            required={products.length > 0}
                          >
                            <option value="" disabled>
                              {loadingProducts ? "Lade Produkte…" : "Produkt wählen"}
                            </option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.sku ? `${product.sku} · ${product.name}` : product.name}
                              </option>
                            ))}
                          </select>
                          {selectedProduct && (
                            <div className="invoice-product-meta">
                              {selectedProduct.name}
                              {selectedProduct.sku ? ` (SKU: ${selectedProduct.sku})` : ""}
                            </div>
                          )}
                        </td>
                        <td>
                          <input
                            className="invoice-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(event) => updateLineItem(item.id, "quantity", event.target.value)}
                            placeholder="0"
                            required
                          />
                        </td>
                        <td>
                          <input
                            className="invoice-input"
                            value={item.unit}
                            onChange={(event) => updateLineItem(item.id, "unit", event.target.value)}
                            placeholder="z.B. Stk, kg"
                          />
                        </td>
                        <td>
                          <input
                            className="invoice-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={(event) => updateLineItem(item.id, "price", event.target.value)}
                            placeholder="0.00"
                            required
                          />
                        </td>
                        <td className="invoice-sum">
                          {currencyFormatter.format(totals[index] ?? 0)}
                        </td>
                        <td className="invoice-actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--small"
                            onClick={() => removeLineItem(item.id)}
                            disabled={lineItems.length === 1}
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
            <div className="invoice-controls">
              <button type="button" className="btn btn--secondary" onClick={addLineItem}>
                Position hinzufügen
              </button>
            </div>
          </section>

          <footer className="invoice-footer">
            <div className="invoice-total">
              <span>Zwischensumme</span>
              <strong>{currencyFormatter.format(grandTotal)}</strong>
            </div>
            <button type="submit" className="btn">
              {saving ? "Speichere…" : "Rechnung sichern"}
            </button>
          </footer>
        </form>

        {errorMessage && <div className="callout callout--danger">{errorMessage}</div>}
        {!errorMessage && lastSavedAt && (
          <div className="callout callout--success">
            Rechnung gespeichert am {lastSavedAt.toLocaleString("de-DE")}.
          </div>
        )}
        {warningMessages.length > 0 && (
          <div className="callout callout--info">
            <strong>Hinweise:</strong>
            <ul>
              {warningMessages.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
