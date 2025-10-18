import { useEffect, useState } from "react";
import { functionsUrl, supabase } from "../lib/supabase";
import { Chart, LineController, LineElement, PointElement, LinearScale, TimeSeriesScale, Title, Tooltip, Filler, CategoryScale } from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Filler);

export default function PriceChart() {
  const [productId, setProductId] = useState<number>(0);
  const [data, setData] = useState<any[]>([]);
  const [prods, setProds] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("products").select("id, sku, name").order("id").then(({data})=>setProds(data||[]));
  }, []);

  useEffect(() => {
    if (!productId) return;
    supabase.auth.getSession().then(async ({data:s}) => {
      const res = await fetch(`${functionsUrl}/prices-product-history?product_id=${productId}`, {
        headers: { Authorization: `Bearer ${s.session?.access_token}` }
      });
      setData(await res.json());
    });
  }, [productId]);

  useEffect(() => {
    const el = document.getElementById("chart") as HTMLCanvasElement | null;
    if (!el || !data?.length) return;
    const labels = data.map((d:any)=>d.date_effective);
    const values = data.map((d:any)=>d.price_per_base_unit_net);
    const chart = new Chart(el, {
      type: "line",
      data: { labels, datasets: [{ label: "Preis pro Basiseinheit (netto)", data: values, tension: 0.2 }] },
      options: { responsive: true, scales: { y: { beginAtZero: false } } }
    });
    return () => chart.destroy();
  }, [data]);

  return (
    <div>
      <h2>Preisentwicklung</h2>
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <span>Produkt:</span>
        <select value={productId} onChange={e=>setProductId(Number(e.target.value))}>
          <option value={0}>Bitte wählen…</option>
          {prods.map(p=><option key={p.id} value={p.id}>{p.id} – {p.sku} – {p.name}</option>)}
        </select>
      </div>
      <div style={{marginTop:16}}>
        <canvas id="chart" height={120}></canvas>
      </div>
    </div>
  );
}
