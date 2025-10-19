import { useEffect, useMemo, useState } from "react";
import { functionsUrl, supabase } from "../lib/supabase";

type Product = {
  id: number;
  sku: string;
  name: string;
};

type PricePoint = {
  date_effective: string;
  price_per_base_unit_net: number;
};

type EnrichedProduct = Product & {
  history: PricePoint[];
  changeValue: number | null;
  changePercent: number | null;
  firstValue: number | null;
  lastValue: number | null;
};

type SortOption = "name-asc" | "name-desc" | "change-desc" | "change-asc";

const currencyFormatter = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const percentFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("de-DE");

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
};

const normalizeHistory = (history: any[]): PricePoint[] => {
  return (history || [])
    .map((entry) => {
      const rawValue = entry.price_per_base_unit_net;
      const parsedValue =
        typeof rawValue === "number"
          ? rawValue
          : rawValue === null || rawValue === undefined
          ? Number.NaN
          : Number(rawValue);
      return {
        date_effective: entry.date_effective,
        price_per_base_unit_net: parsedValue,
      };
    })
    .filter((entry) => !!entry.date_effective && Number.isFinite(entry.price_per_base_unit_net))
    .sort(
      (a, b) => new Date(a.date_effective).getTime() - new Date(b.date_effective).getTime()
    );
};

const describeChange = (
  changeValue: number | null,
  changePercent: number | null,
): { direction: -1 | 0 | 1; currencyLabel: string; percentLabel: string } | null => {
  if (changeValue === null) return null;
  const direction = changeValue > 0 ? 1 : changeValue < 0 ? -1 : 0;
  const currencyLabel =
    changeValue === 0
      ? `±${formatCurrency(0)}`
      : `${direction > 0 ? "+" : "−"}${formatCurrency(Math.abs(changeValue))}`;
  const percentLabel =
    changePercent === null
      ? "–"
      : changeValue === 0
      ? "±0,0 %"
      : `${direction > 0 ? "+" : "−"}${percentFormatter.format(Math.abs(changePercent))}%`;
  return { direction: direction as -1 | 0 | 1, currencyLabel, percentLabel };
};

type SparklineProps = {
  data: PricePoint[];
};

function Sparkline({ data }: SparklineProps) {
  const chartData = useMemo(() => {
    if (!data?.length) return null;
    const width = 160;
    const height = 56;
    const values = data.map((point) => point.price_per_base_unit_net);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = data.length > 1 ? width / (data.length - 1) : 0;
    const points = values
      .map((value, index) => {
        const x = data.length > 1 ? index * step : width / 2;
        const y = height - ((value - min) / range) * height;
        return { x, y };
      })
      .map(({ x, y }) => `${x},${y}`)
      .join(" ");

    const lastValue = values[values.length - 1];
    const lastX = data.length > 1 ? (values.length - 1) * step : width / 2;
    const lastY = height - ((lastValue - min) / range) * height;

    const areaPoints =
      data.length > 1
        ? `0,${height} ${points} ${width},${height}`
        : `0,${height} ${width},${height} ${width / 2},${lastY}`;

    return { width, height, points, areaPoints, lastX, lastY };
  }, [data]);

  if (!chartData) return null;

  const { width, height, points, areaPoints, lastX, lastY } = chartData;

  return (
    <svg
      className="price-sparkline"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polygon points={areaPoints} fill="rgba(37, 99, 235, 0.12)" />
      <polyline
        points={points}
        fill="none"
        stroke="rgb(37, 99, 235)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3} fill="rgb(37, 99, 235)" />
    </svg>
  );
}

type HistoryChartProps = {
  data: PricePoint[];
};

function HistoryChart({ data }: HistoryChartProps) {
  const chartData = useMemo(() => {
    if (!data?.length) return null;

    const width = 700;
    const height = 320;
    const paddingX = 56;
    const paddingY = 42;
    const innerWidth = width - paddingX * 2;
    const innerHeight = height - paddingY * 2;

    const values = data.map((point) => point.price_per_base_unit_net);
    const timestamps = data.map((point) => new Date(point.date_effective).getTime());
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    const actualMinValue = minValue;
    const actualMaxValue = maxValue;
    if (minValue === maxValue) {
      const offset = actualMinValue === 0 ? 1 : Math.abs(actualMinValue) * 0.05 || 1;
      minValue = minValue - offset;
      maxValue = maxValue + offset;
    }
    const valueRange = maxValue - minValue || 1;

    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const timestampRange = maxTimestamp - minTimestamp || 1;

    const baseline = paddingY + innerHeight;

    const points = data.map((point) => {
      const timeValue = new Date(point.date_effective).getTime();
      const x =
        timestampRange === 0
          ? paddingX + innerWidth / 2
          : paddingX + ((timeValue - minTimestamp) / timestampRange) * innerWidth;
      const y =
        valueRange === 0
          ? paddingY + innerHeight / 2
          : paddingY + (1 - (point.price_per_base_unit_net - minValue) / valueRange) * innerHeight;
      return { x, y };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
      .join(" ");

    const areaPath = `M${points[0].x} ${baseline} ${points
      .map((point) => `L${point.x} ${point.y}`)
      .join(" ")} L${points[points.length - 1].x} ${baseline} Z`;

    const yTickCount = 4;
    const yTicks = Array.from({ length: yTickCount + 1 }, (_, index) => {
      const ratio = index / yTickCount;
      const labelValue =
        actualMaxValue === actualMinValue
          ? actualMaxValue
          : actualMaxValue - ratio * (actualMaxValue - actualMinValue);
      const y = paddingY + ratio * innerHeight;
      return { y, labelValue };
    });

    const xTickCount = Math.min(4, data.length - 1);
    const xTickIndices =
      data.length === 1
        ? [0]
        : Array.from({ length: xTickCount + 1 }, (_, index) =>
            Math.round((index / xTickCount) * (data.length - 1)),
          );
    const uniqueIndices = Array.from(new Set(xTickIndices));
    const xTicks = uniqueIndices.map((idx) => {
      const point = points[idx];
      return { x: point.x, label: formatDate(data[idx].date_effective) };
    });

    return {
      width,
      height,
      paddingX,
      paddingY,
      linePath,
      areaPath,
      yTicks,
      xTicks,
      baseline,
      points,
    };
  }, [data]);

  if (!chartData) return null;

  const { width, height, paddingX, paddingY, linePath, areaPath, yTicks, xTicks, baseline, points } =
    chartData;

  return (
    <svg
      className="price-detail__chart"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <rect
        x={paddingX}
        y={paddingY}
        width={width - paddingX * 2}
        height={height - paddingY * 2}
        fill="rgba(37, 99, 235, 0.06)"
        stroke="rgba(37, 99, 235, 0.2)"
        strokeWidth={1}
        rx={16}
      />
      <path d={areaPath} fill="rgba(37, 99, 235, 0.14)" stroke="none" />
      <path d={linePath} fill="none" stroke="rgb(37, 99, 235)" strokeWidth={3} strokeLinecap="round" />
      {yTicks.map((tick, index) => (
        <g key={`y-${index}`}>
          <line
            x1={paddingX}
            y1={tick.y}
            x2={width - paddingX}
            y2={tick.y}
            stroke="rgba(15, 23, 42, 0.1)"
            strokeDasharray={index === 0 ? "0" : "4 6"}
          />
          <text
            x={paddingX - 12}
            y={tick.y + 4}
            textAnchor="end"
            fontSize={12}
            fill="rgba(15, 23, 42, 0.6)"
          >
            {formatCurrency(tick.labelValue)}
          </text>
        </g>
      ))}
      {xTicks.map((tick, index) => (
        <g key={`x-${index}`}>
          <line
            x1={tick.x}
            y1={paddingY}
            x2={tick.x}
            y2={baseline}
            stroke="rgba(15, 23, 42, 0.08)"
            strokeDasharray="4 6"
          />
          <text
            x={tick.x}
            y={baseline + 20}
            textAnchor="middle"
            fontSize={12}
            fill="rgba(15, 23, 42, 0.6)"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {points.map((point, index) => (
        <circle key={`point-${index}`} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2.5} fill="rgb(37, 99, 235)" opacity={index === points.length - 1 ? 1 : 0.5} />
      ))}
    </svg>
  );
}

export default function PriceChart() {
  const [products, setProducts] = useState<Product[]>([]);
  const [histories, setHistories] = useState<Record<number, PricePoint[]>>({});
  const [historyErrors, setHistoryErrors] = useState<Record<number, string>>({});
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingHistories, setIsLoadingHistories] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoadingProducts(true);
    supabase
      .from("products")
      .select("id, sku, name")
      .order("id")
      .then(({ data: fetchedProducts, error }) => {
        if (isCancelled) return;
        if (error) {
          setMessage("Produkte konnten nicht geladen werden.");
          setProducts([]);
        } else {
          setProducts(fetchedProducts || []);
        }
        setIsLoadingProducts(false);
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!products.length) {
      setHistories({});
      setHistoryErrors({});
      return;
    }

    let isCancelled = false;
    setIsLoadingHistories(true);
    setHistories({});
    setHistoryErrors({});

    supabase.auth.getSession().then(async ({ data: session }) => {
      if (isCancelled) return;
      const token = session.session?.access_token;
      if (!token) {
        setMessage("Preisdaten konnten nicht geladen werden.");
        setIsLoadingHistories(false);
        return;
      }

      const results = await Promise.allSettled(
        products.map(async (product) => {
          const res = await fetch(
            `${functionsUrl}/prices-product-history?product_id=${product.id}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          if (!res.ok) {
            throw new Error("failed");
          }

          const payload = await res.json();
          return { productId: product.id, history: normalizeHistory(payload) };
        })
      );

      if (isCancelled) return;

      const historyMap: Record<number, PricePoint[]> = {};
      const errorMap: Record<number, string> = {};

      results.forEach((result, index) => {
        const productId = products[index]?.id;
        if (!productId) return;
        if (result.status === "fulfilled") {
          historyMap[productId] = result.value.history;
        } else {
          errorMap[productId] = "Preisdaten nicht verfügbar.";
        }
      });

      setHistories(historyMap);
      setHistoryErrors(errorMap);
      setIsLoadingHistories(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [products]);

  const enrichedProducts = useMemo<EnrichedProduct[]>(() => {
    return products.map((product) => {
      const history = histories[product.id] || [];
      const hasHistory = history.length > 0;
      const firstValue = hasHistory ? history[0].price_per_base_unit_net : null;
      const lastValue = hasHistory ? history[history.length - 1].price_per_base_unit_net : null;
      const changeValue =
        hasHistory && firstValue !== null && lastValue !== null ? lastValue - firstValue : null;
      const changePercent =
        hasHistory && typeof firstValue === "number" && firstValue !== 0
          ? ((lastValue! - firstValue) / firstValue) * 100
          : null;
      return {
        ...product,
        history,
        changeValue,
        changePercent,
        firstValue,
        lastValue,
      };
    });
  }, [histories, products]);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return enrichedProducts;
    return enrichedProducts.filter((product) => {
      return (
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        String(product.id).includes(query)
      );
    });
  }, [enrichedProducts, searchTerm]);

  const visibleProducts = useMemo(() => {
    const sorted = [...filteredProducts];
    sorted.sort((a, b) => {
      switch (sortOption) {
        case "name-desc":
          return b.name.localeCompare(a.name, "de");
        case "change-desc": {
          const changeA = a.changeValue ?? Number.NEGATIVE_INFINITY;
          const changeB = b.changeValue ?? Number.NEGATIVE_INFINITY;
          return changeB - changeA;
        }
        case "change-asc": {
          const changeA = a.changeValue ?? Number.POSITIVE_INFINITY;
          const changeB = b.changeValue ?? Number.POSITIVE_INFINITY;
          return changeA - changeB;
        }
        case "name-asc":
        default:
          return a.name.localeCompare(b.name, "de");
      }
    });
    return sorted;
  }, [filteredProducts, sortOption]);

  useEffect(() => {
    if (!visibleProducts.length) {
      setSelectedProductId(null);
      return;
    }

    setSelectedProductId((current) => {
      if (current && visibleProducts.some((product) => product.id === current)) {
        return current;
      }
      return visibleProducts[0].id;
    });
  }, [visibleProducts]);

  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return visibleProducts.find((product) => product.id === selectedProductId) ?? null;
  }, [selectedProductId, visibleProducts]);

  const selectedChange = selectedProduct
    ? describeChange(selectedProduct.changeValue, selectedProduct.changePercent)
    : null;

  const selectedError = selectedProduct ? historyErrors[selectedProduct.id] : undefined;

  const recentHistory = useMemo(() => {
    if (!selectedProduct) return [] as PricePoint[];
    return [...selectedProduct.history].slice(-20).reverse();
  }, [selectedProduct]);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Preisentwicklung</h1>
        <p>
          Erhalten Sie einen schnellen Überblick über alle Produkte und verfolgen Sie die historische
          Entwicklung der Netto-Preise je Basiseinheit.
        </p>
      </header>

      <section className="card card--shadow-strong">
        <h2 className="section-title">Preisverlauf nach Produkt</h2>
        {message && <div className="callout callout--danger">{message}</div>}
        {isLoadingProducts && <div className="callout">Produkte werden geladen…</div>}
        {isLoadingHistories && !isLoadingProducts && (
          <div className="callout">Preisdaten werden geladen…</div>
        )}
        {!isLoadingProducts && !products.length && (
          <div className="callout">Es sind keine Produkte vorhanden.</div>
        )}

        <div className="price-layout">
          <aside className="price-sidebar">
            <div className="price-controls">
              <label className="price-controls__field">
                <span className="price-controls__label">Suche</span>
                <input
                  id="product-search"
                  type="search"
                  className="price-controls__input"
                  placeholder="Produkt, SKU oder ID"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
              <label className="price-controls__field">
                <span className="price-controls__label">Sortierung</span>
                <select
                  id="product-sort"
                  className="price-controls__input"
                  value={sortOption}
                  onChange={(event) => setSortOption(event.target.value as SortOption)}
                >
                  <option value="name-asc">Name (A–Z)</option>
                  <option value="name-desc">Name (Z–A)</option>
                  <option value="change-desc">Größte Preissteigerung</option>
                  <option value="change-asc">Größte Preissenkung</option>
                </select>
              </label>
            </div>
            <div className="price-list-wrapper">
              {visibleProducts.length ? (
                <ul className="price-list">
                  {visibleProducts.map((product) => {
                    const changeDescriptor = describeChange(
                      product.changeValue,
                      product.changePercent,
                    );
                    const isActive = product.id === selectedProductId;
                    const error = historyErrors[product.id];
                    const hasHistory = product.history.length > 0;

                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          className={`price-list__item ${
                            isActive ? "price-list__item--active" : ""
                          }`}
                          onClick={() => setSelectedProductId(product.id)}
                        >
                          <div className="price-list__heading">
                            <span className="price-list__name">{product.name}</span>
                            {changeDescriptor && (
                              <span
                                className={`price-list__change ${
                                  changeDescriptor.direction > 0
                                    ? "price-list__change--up"
                                    : changeDescriptor.direction < 0
                                    ? "price-list__change--down"
                                    : ""
                                }`}
                              >
                                {changeDescriptor.currencyLabel} ({changeDescriptor.percentLabel})
                              </span>
                            )}
                          </div>
                          <div className="price-list__meta">
                            <span className="price-list__sku">#{product.id}</span>
                            <span className="price-list__sku">{product.sku}</span>
                            {product.lastValue !== null && (
                              <strong className="price-list__price">
                                {formatCurrency(product.lastValue)}
                              </strong>
                            )}
                          </div>
                          <div className="price-list__sparkline">
                            {hasHistory && <Sparkline data={product.history} />}
                            {!hasHistory && error && (
                              <span className="price-list__state">{error}</span>
                            )}
                            {!hasHistory && !error && isLoadingHistories && (
                              <span className="price-list__state">Lade Preisdaten…</span>
                            )}
                            {!hasHistory && !error && !isLoadingHistories && (
                              <span className="price-list__state">Keine Preisdaten</span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="price-sidebar__empty">
                  {searchTerm
                    ? "Keine Produkte entsprechen der Suche."
                    : "Keine Produkte verfügbar."}
                </div>
              )}
            </div>
          </aside>
          <div className="price-detail">
            {selectedProduct ? (
              <div className="price-detail__content">
                <header className="price-detail__header">
                  <div>
                    <h3>{selectedProduct.name}</h3>
                    <p>
                      Produkt #{selectedProduct.id} · {selectedProduct.sku}
                    </p>
                  </div>
                  {selectedProduct.lastValue !== null && (
                    <div className="price-detail__value">
                      <span className="price-detail__value-label">Letzter Preis</span>
                      <strong>{formatCurrency(selectedProduct.lastValue)}</strong>
                    </div>
                  )}
                </header>
                <div className="price-detail__chart-area">
                  {selectedProduct.history.length > 0 && <HistoryChart data={selectedProduct.history} />}
                  {selectedProduct.history.length === 0 && (
                    <div className="price-detail__empty">
                      {selectedError
                        ? selectedError
                        : isLoadingHistories
                        ? "Preisdaten werden geladen…"
                        : "Für dieses Produkt liegen noch keine Preisdaten vor."}
                    </div>
                  )}
                </div>
                <div className="price-detail__meta">
                  <div>
                    <span className="price-detail__meta-label">Zeitraum</span>
                    {selectedProduct.history.length > 0 ? (
                      <strong>
                        {`${formatDate(selectedProduct.history[0].date_effective)} – ${formatDate(
                          selectedProduct.history[selectedProduct.history.length - 1].date_effective,
                        )}`}
                      </strong>
                    ) : (
                      <strong>–</strong>
                    )}
                  </div>
                  <div>
                    <span className="price-detail__meta-label">Erster Preis</span>
                    <strong>
                      {selectedProduct.firstValue !== null
                        ? formatCurrency(selectedProduct.firstValue)
                        : "–"}
                    </strong>
                  </div>
                  <div>
                    <span className="price-detail__meta-label">Veränderung</span>
                    {selectedChange ? (
                      <strong
                        className={`price-detail__change ${
                          selectedChange.direction > 0
                            ? "price-detail__change--up"
                            : selectedChange.direction < 0
                            ? "price-detail__change--down"
                            : ""
                        }`}
                      >
                        {selectedChange.currencyLabel} ({selectedChange.percentLabel})
                      </strong>
                    ) : (
                      <strong>–</strong>
                    )}
                  </div>
                </div>
                {selectedProduct.history.length > 0 && (
                  <div className="price-detail__history">
                    <h4>Historische Preise</h4>
                    <div className="price-detail__history-table-wrapper">
                      <table className="price-detail__history-table">
                        <thead>
                          <tr>
                            <th>Datum</th>
                            <th>Preis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentHistory.map((entry, index) => (
                            <tr key={`${entry.date_effective}-${index}`}>
                              <td>{formatDate(entry.date_effective)}</td>
                              <td>{formatCurrency(entry.price_per_base_unit_net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="price-detail__empty">Wählen Sie links ein Produkt aus.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
