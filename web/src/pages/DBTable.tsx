import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = {
  product_id: number;
  channel: string;
  sales_price_net_per_unit: number | null;
  purchase_cost_net_per_unit: number | null;
  dbi: number | null;
  db_margin: number | null;
};

export default function DBTable() {
  const [rows, setRows] = useState<Row[]>([]);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      }),
    [],
  );

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("product_dbi_current").select("*").order("product_id");
      setRows((data as Row[]) || []);
    };
    void load();
  }, []);

  const renderCurrency = (value: number | null) => {
    if (value == null) return "–";
    return currency.format(value);
  };

  const renderPercent = (value: number | null) => {
    if (value == null) return "–";
    return `${(value * 100).toFixed(1)} %`;
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Verkaufspreise &amp; Deckungsbeiträge</h1>
        <p>Aktuelle Margen je Kanal im Überblick – für schnelle Preisentscheidungen und Monitoring.</p>
      </header>

      <section className="card">
        <h2 className="section-title">Kennzahlen</h2>
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
              {rows.map((row) => (
                <tr key={`${row.product_id}-${row.channel}`}>
                  <td>{row.product_id}</td>
                  <td>{row.channel}</td>
                  <td>{renderCurrency(row.sales_price_net_per_unit)}</td>
                  <td>{renderCurrency(row.purchase_cost_net_per_unit)}</td>
                  <td>{renderCurrency(row.dbi)}</td>
                  <td>{renderPercent(row.db_margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
