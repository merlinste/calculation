import { ChangeEvent, useEffect, useState } from "react";
import { useProductOptions } from "../lib/useProductOptions";
import {
  type ProductionComponent,
  useProductionBlueprint,
} from "../lib/useProductionBlueprint";

type ComponentSummary = {
  ingredientId: number | null;
  ingredientName: string;
  grams: number | null;
  farmingType: string | null;
  shortage: number;
};

type AssignmentRow = {
  key: string;
  ingredientName: string;
  lotCode: string;
  bestBefore: string | null;
  available: number;
  allocated: number;
};

const gramsFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const gramsFormatterDetailed = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const formatGrams = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) return "–";
  if (Math.abs(value) >= 1) {
    return gramsFormatter.format(value);
  }
  return gramsFormatterDetailed.format(value);
};

const formatDate = (value: string | null): string => {
  if (!value) return "–";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("de-DE");
};

const formatFarmingType = (value: string | null): string => {
  if (!value) return "–";
  const normalized = value.trim().toLowerCase();
  if (normalized === "bio" || normalized === "organic") return "Bio";
  if (normalized === "konventionell" || normalized === "conventional") return "Konventionell";
  return value;
};

const toInputString = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return "";
  }
  const rounded = Number(value.toFixed(3));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0+$/, "");
};

const buildAssignments = (components: ProductionComponent[]): AssignmentRow[] => {
  const rows: AssignmentRow[] = [];
  components.forEach((component, componentIndex) => {
    if (!component.allocations.length) {
      return;
    }
    component.allocations.forEach((allocation, allocationIndex) => {
      rows.push({
        key: `${component.ingredientId ?? componentIndex}-${allocation.lotId}-${allocationIndex}`,
        ingredientName: component.ingredientName,
        lotCode: allocation.lotCode,
        bestBefore: allocation.bestBefore,
        available: allocation.availableBeforeAllocation,
        allocated: allocation.allocated,
      });
    });
  });
  return rows;
};

const summariseComponents = (components: ProductionComponent[]): ComponentSummary[] =>
  components.map((component) => ({
    ingredientId: component.ingredientId,
    ingredientName: component.ingredientName,
    grams: component.grams,
    farmingType: component.farmingType,
    shortage: component.shortage,
  }));

const hasShortage = (components: ComponentSummary[]): boolean =>
  components.some((component) => component.shortage != null && component.shortage > 0.0001);

const formatShortage = (shortage: number): string => {
  if (!Number.isFinite(shortage) || shortage <= 0) return "–";
  return formatGrams(shortage);
};

export default function Productions() {
  const { products, loading: loadingProducts, error: productsError } = useProductOptions();
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const { blueprint, loading: loadingBlueprint, error: blueprintError } = useProductionBlueprint(selectedProductId);

  const [batchSize, setBatchSize] = useState<string>("");
  const [farmingType, setFarmingType] = useState<string>("");
  const [componentSummaries, setComponentSummaries] = useState<ComponentSummary[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>([]);

  useEffect(() => {
    if (!blueprint) {
      setBatchSize("");
      setFarmingType("");
      setComponentSummaries([]);
      setAssignmentRows([]);
      return;
    }

    setBatchSize(toInputString(blueprint.product.batchGrams));
    const preferredFarming =
      blueprint.product.farmingType ?? (blueprint.product.isOrganic ? "bio" : blueprint.product.isConventional ? "konventionell" : "");
    setFarmingType(preferredFarming);
    setComponentSummaries(summariseComponents(blueprint.components));
    setAssignmentRows(buildAssignments(blueprint.components));
  }, [blueprint?.product.id, blueprint]);

  const handleProductChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedProductId(value ? Number(value) : null);
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Produktionen</h1>
        <p>Produktionschargen anhand der Rezepturen planen und verfügbare Lots nach dem FIFO-Prinzip vorbelegen.</p>
      </header>

      <section className="card">
        <h2 className="section-title">Produkt auswählen</h2>
        {productsError && <div className="callout callout--danger">Produkte konnten nicht geladen werden: {productsError}</div>}
        <label>
          <span>Produkt</span>
          <select value={selectedProductId ?? ""} onChange={handleProductChange} disabled={loadingProducts}>
            <option value="" disabled>
              {loadingProducts ? "Produkte laden…" : "Produkt wählen"}
            </option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.sku}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedProductId && (
        <section className="card">
          <h2 className="section-title">Produktionsdetails</h2>
          {blueprintError && <div className="callout callout--danger">Vorbelegung fehlgeschlagen: {blueprintError}</div>}
          {!blueprint && loadingBlueprint && <div className="callout">Vorbelegung wird geladen…</div>}
          {blueprint && (
            <div className="form-grid">
              <label>
                <span>Charge (Gramm)</span>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(event) => setBatchSize(event.target.value)}
                  min={0}
                  step={1}
                />
              </label>
              <label>
                <span>Herkunft</span>
                <input
                  type="text"
                  value={farmingType}
                  onChange={(event) => setFarmingType(event.target.value)}
                  placeholder="Bio oder Konventionell"
                />
              </label>
              <div>
                <span>SKU</span>
                <div className="input-like">{blueprint.product.sku ?? "–"}</div>
              </div>
              <div>
                <span>Produktname</span>
                <div className="input-like">{blueprint.product.name}</div>
              </div>
            </div>
          )}
        </section>
      )}

      {selectedProductId && (
        <section className="card">
          <h2 className="section-title">Rezeptur &amp; Lots</h2>
          {loadingBlueprint && !blueprint && <div className="callout">Rezeptur wird geladen…</div>}
          {blueprint && (
            <>
              {componentSummaries.length > 0 ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Zutat</th>
                        <th>Benötigt (g)</th>
                        <th>Qualität</th>
                        <th>Fehlmenge (g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {componentSummaries.map((component) => (
                        <tr key={component.ingredientId ?? component.ingredientName}>
                          <td>{component.ingredientName}</td>
                          <td>{formatGrams(component.grams)}</td>
                          <td>{formatFarmingType(component.farmingType)}</td>
                          <td>{formatShortage(component.shortage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="callout">Für dieses Produkt ist keine Rezeptur hinterlegt.</div>
              )}

              {assignmentRows.length > 0 ? (
                <div className="table-scroll" style={{ marginTop: "1.5rem" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Zutat</th>
                        <th>Lot</th>
                        <th>MHD / Datum</th>
                        <th>Verfügbar (g)</th>
                        <th>Vorgeschlagen (g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignmentRows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.ingredientName}</td>
                          <td>{row.lotCode}</td>
                          <td>{formatDate(row.bestBefore)}</td>
                          <td>{formatGrams(row.available)}</td>
                          <td>{formatGrams(row.allocated)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="callout" style={{ marginTop: "1.5rem" }}>
                  Es konnten keine passenden Lots gefunden werden.
                </div>
              )}

              {hasShortage(componentSummaries) && (
                <div className="callout callout--warning" style={{ marginTop: "1.5rem" }}>
                  Für einzelne Zutaten sind nicht genügend Mengen verfügbar. Bitte Bestand prüfen oder Los manuell anpassen.
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
