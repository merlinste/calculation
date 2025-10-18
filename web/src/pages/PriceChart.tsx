import { useEffect, useState } from "react";
import { functionsUrl, supabase } from "../lib/supabase";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  Tooltip,
  Filler,
  CategoryScale,
} from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Filler);

export default function PriceChart() {
  const [productId, setProductId] = useState<number>(0);
  const [data, setData] = useState<any[]>([]);
  const [prods, setProds] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("products")
      .select("id, sku, name")
      .order("id")
      .then(({ data: products }) => setProds(products || []));
  }, []);

  useEffect(() => {
    if (!productId) {
      setData([]);
      return;
    }

    setIsLoading(true);
    setMessage(null);

    supabase.auth.getSession().then(async ({ data: session }) => {
      const res = await fetch(`${functionsUrl}/prices-product-history?product_id=${productId}`, {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });

      if (!res.ok) {
        setMessage("Preisdaten konnten nicht geladen werden.");
        setData([]);
      } else {
        setData(await res.json());
      }
      setIsLoading(false);
    });
  }, [productId]);

  useEffect(() => {
    const el = document.getElementById("chart") as HTMLCanvasElement | null;
    if (!el || !data?.length) return;
    const labels = data.map((d: any) => d.date_effective);
    const values = data.map((d: any) => d.price_per_base_unit_net);
    const chart = new Chart(el, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Preis pro Basiseinheit (netto)",
            data: values,
            tension: 0.2,
            fill: true,
            backgroundColor: "rgba(99, 102, 241, 0.15)",
            borderColor: "#6366f1",
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: false },
        },
      },
    });
    return () => chart.destroy();
  }, [data]);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Preisentwicklung</h1>
        <p>Analysieren Sie die historischen Netto-Verkaufspreise je Basiseinheit, um Trends zu erkennen.</p>
      </header>

      <section className="card">
        <h2 className="section-title">Produkt auswählen</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <label style={{ minWidth: "240px", flex: "1 1 240px" }}>
            <span>Produkt</span>
            <select value={productId} onChange={(event) => setProductId(Number(event.target.value))}>
              <option value={0}>Bitte wählen…</option>
              {prods.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.id} – {product.sku} – {product.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card card--shadow-strong">
        <h2 className="section-title">Preisverlauf</h2>
        {!productId && <div className="callout">Bitte wählen Sie zunächst ein Produkt aus.</div>}
        {message && !isLoading && <div className="callout callout--danger">{message}</div>}
        {isLoading && <div className="callout">Preisdaten werden geladen…</div>}
        <div style={{ marginTop: "12px" }}>
          <canvas id="chart" height={140}></canvas>
        </div>
      </section>
    </div>
  );
}
