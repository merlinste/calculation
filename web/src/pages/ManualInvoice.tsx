import { FormEvent, useMemo, useState } from "react";
import { useProductOptions } from "../lib/useProductOptions";

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
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([createLineItem(0)]);
  const [nextId, setNextId] = useState(1);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const { products, loading: loadingProducts, error: productsError } = useProductOptions();

  const productMap = useMemo(() => {
    const map = new Map<number, { id: number; name: string; sku: string }>();
    products.forEach((product) => {
      map.set(product.id, { id: product.id, name: product.name, sku: product.sku });
    });
    return map;
  }, [products]);

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
      const quantity = parseFloat(item.quantity.replace(",", ".")) || 0;
      const price = parseFloat(item.price.replace(",", ".")) || 0;
      return quantity * price;
    });
  }, [lineItems]);

  const grandTotal = useMemo(
    () => totals.reduce((sum, value) => sum + value, 0),
    [totals],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      supplier,
      invoiceNumber,
      invoiceDate,
      lineItems: lineItems.map((item, index) => {
        const product = item.productId != null ? productMap.get(item.productId) : undefined;
        return {
          productId: product?.id ?? null,
          productSku: product?.sku ?? null,
          productName: product?.name ?? null,
          quantity: parseFloat(item.quantity.replace(",", ".")) || 0,
          unit: item.unit.trim(),
          price: parseFloat(item.price.replace(",", ".")) || 0,
          total: totals[index],
        };
      }),
      totalAmount: grandTotal,
    };

    // Temporäre Ausgabe für die manuelle Erfassung
    console.table(payload.lineItems);
    console.info("Rechnung gespeichert", payload);

    setLastSavedAt(new Date());
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Rechnung manuell erfassen</h1>
        <p>
          Erfasse Lieferant, Rechnungsnummer und die einzelnen Positionen einer Rechnung. Die Daten
          werden lokal gehalten und können anschließend weiterverarbeitet werden.
        </p>
      </header>

      <div className="card card--shadow-strong">
        <form className="form-grid" onSubmit={handleSubmit}>
          <section className="form-grid two-columns">
            <label>
              <span>Lieferant</span>
              <input
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                placeholder="Lieferant oder Firma"
                required
              />
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
              Rechnung sichern
            </button>
          </footer>
        </form>

        {lastSavedAt && (
          <div className="callout callout--success">
            Rechnung gespeichert am {lastSavedAt.toLocaleString("de-DE")} (lokal). Die Positionen sind in
            der Entwicklerkonsole einsehbar.
          </div>
        )}
      </div>
    </div>
  );
}
