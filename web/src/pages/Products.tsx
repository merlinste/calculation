import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Product = {
  id:number; sku:string; name:string; base_uom:'piece'|'kg'; pieces_per_TU:number|null; active:boolean;
};

export default function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("products").select("id, sku, name, base_uom, pieces_per_TU, active").order("id");
    if (error) setMsg(error.message);
    else setItems(data as any);
  };
  useEffect(() => { load(); }, []);

  const update = async (p: Product) => {
    const { error } = await supabase.from("products").update({ pieces_per_TU: p.pieces_per_TU, base_uom: p.base_uom }).eq("id", p.id);
    setMsg(error ? error.message : "Gespeichert.");
  };

  return (
    <div>
      <h2>Artikel</h2>
      <table style={{borderCollapse:'collapse', width:'100%'}}>
        <thead><tr>
          <th>ID</th><th>SKU</th><th>Name</th><th>Basiseinheit</th><th>pieces_per_TU</th><th>Aktionen</th>
        </tr></thead>
        <tbody>
          {items.map(p=>(
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.sku}</td>
              <td>{p.name}</td>
              <td>
                <select value={p.base_uom} onChange={e=>setItems(s=>s.map(x=>x.id===p.id?{...x, base_uom:e.target.value as any}:x))}>
                  <option value="piece">piece</option>
                  <option value="kg">kg</option>
                </select>
              </td>
              <td>
                <input type="number" min={0} value={p.pieces_per_TU ?? 0}
                  onChange={e=>setItems(s=>s.map(x=>x.id===p.id?{...x, pieces_per_TU:Number(e.target.value)}:x))}
                  style={{width:100}} />
              </td>
              <td><button onClick={()=>update(p)}>Speichern</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p>{msg}</p>}
    </div>
  );
}
