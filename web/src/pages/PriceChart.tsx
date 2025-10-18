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

export default function PriceChart() {
  const [products, setProducts] = useState<Product[]>([]);
  const [histories, setHistories] = useState<Record<number, PricePoint[]>>({});
  const [historyErrors, setHistoryErrors] = useState<Record<number, string>>({});
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingHistories, setIsLoadingHistories] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

        <div className="price-grid">
          {products.map((product) => {
            const history = histories[product.id] || [];
            const error = historyErrors[product.id];
            const hasHistory = history.length > 0;
            const firstValue = hasHistory ? history[0].price_per_base_unit_net : null;
            const lastValue = hasHistory
              ? history[history.length - 1].price_per_base_unit_net
              : null;
            const changeValue =
              hasHistory && firstValue !== null && lastValue !== null
                ? lastValue - firstValue
                : null;
            const changePercent =
              hasHistory && typeof firstValue === "number" && firstValue !== 0
                ? ((lastValue! - firstValue) / firstValue) * 100
                : null;

            const changeLabel =
              changeValue === null
                ? null
                : changePercent === null
                ? "–"
                : changeValue === 0
                ? "±0,0 %"
                : `${changeValue > 0 ? "+" : "−"}${percentFormatter.format(
                    Math.abs(changePercent)
                  )}%`;
            const changeCurrency =
              changeValue === null
                ? null
                : changeValue === 0
                ? `±${formatCurrency(0)}`
                : `${changeValue > 0 ? "+" : "−"}${formatCurrency(Math.abs(changeValue))}`;

            return (
              <article key={product.id} className="price-tile">
                <div className="price-tile__header">
                  <strong>{product.name}</strong>
                  <span className="price-tile__subline">
                    #{product.id} · {product.sku}
                  </span>
                </div>
                <div className="price-tile__chart">
                  {hasHistory && <Sparkline data={history} />}
                  {!hasHistory && !error && isLoadingHistories && (
                    <span className="price-tile__state">Lade Preisdaten…</span>
                  )}
                  {!hasHistory && !error && !isLoadingHistories && (
                    <span className="price-tile__state">Keine Preisdaten vorhanden.</span>
                  )}
                  {error && <span className="price-tile__state">{error}</span>}
                </div>
                {hasHistory && lastValue !== null && (
                  <div className="price-tile__meta">
                    <div className="price-tile__meta-line">
                      <span className="price-tile__meta-label">Letzter Preis</span>
                      <strong>{formatCurrency(lastValue)}</strong>
                    </div>
                    <div className="price-tile__meta-line">
                      <span className="price-tile__meta-label">Zeitraum</span>
                      <span>
                        {formatDate(history[0].date_effective)} – {formatDate(history[history.length - 1].date_effective)}
                      </span>
                    </div>
                    {changeValue !== null && (
                      <div className="price-tile__meta-line">
                        <span className="price-tile__meta-label">Veränderung</span>
                        <span
                          className={`price-tile__change ${
                            changeValue > 0 ? "price-tile__change--up" : changeValue < 0 ? "price-tile__change--down" : ""
                          }`}
                        >
                          {changeCurrency} ({changeLabel})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
