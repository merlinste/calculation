type BaseUom = "piece" | "kg";

export function allocateSurcharges({
  items,                   // produkt-zeilen in Basiseinheiten
  totalSurchargeNet,       // Summe line_type=surcharge (netto)
  mode                     // 'per_kg' | 'per_piece' | 'none'
}: {
  items: { product_id: number; base_uom: BaseUom; qty_base: number; base_price_per_unit: number }[];
  totalSurchargeNet: number;
  mode: "per_kg" | "per_piece" | "none";
}) {
  const bucketUom: BaseUom | null =
    mode === "per_kg" ? "kg" : mode === "per_piece" ? "piece" : null;

  if (!bucketUom || totalSurchargeNet === 0) {
    return items.map(it => ({ ...it, surcharge_per_unit: 0 }));
  }

  const denom = items
    .filter(it => it.base_uom === bucketUom)
    .reduce((acc, it) => acc + it.qty_base, 0);

  const perUnit = denom > 0 ? totalSurchargeNet / denom : 0;

  return items.map(it => ({
    ...it,
    surcharge_per_unit: it.base_uom === bucketUom ? perUnit : 0
  }));
}
