import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function DBTable() {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from("product_dbi_current").select("*").order("product_id");
    setRows(data||[]);
  };
  useEffect(()=>{ load(); },[]);
  return (
    <div>
      <h2>Verkaufspreise & DB (aktuell)</h2>
      <table style={{borderCollapse:'collapse', width:'100%'}}>
        <thead><tr>
          <th>Produkt</th><th>Kanal</th><th>VK netto</th><th>Ø EK (90d)</th><th>DB I</th><th>DB-Quote</th>
        </tr></thead>
        <tbody>
          {rows.map(r=>(
            <tr key={`${r.product_id}-${r.channel}`}>
              <td>{r.product_id}</td>
              <td>{r.channel}</td>
              <td>{r.sales_price_net_per_unit ?? "-"}</td>
              <td>{r.purchase_cost_net_per_unit ?? "-"}</td>
              <td>{r.dbi ?? "-"}</td>
              <td>{r.db_margin != null ? (r.db_margin*100).toFixed(1)+" %" : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
