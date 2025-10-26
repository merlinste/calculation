import {
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { FunctionsFetchError } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";
import { correctPriceOutliers } from "../lib/priceHistory";

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
  originalHistory: PricePoint[];
  changeValue: number | null;
  changePercent: number | null;
  firstValue: number | null;
  lastValue: number | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  hasHistoryOutsideRange: boolean;
};

type SortOption = "name-asc" | "name-desc" | "change-desc" | "change-asc";

const currencyFormatter = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const percentFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("de-DE");

const formatCurrency = (value: number) => currencyFormatter.format(value);
const SESSION_ERROR_MESSAGE = "Sitzung konnte nicht geladen werden.";
const LOGIN_REQUIRED_MESSAGE = "Bitte melden Sie sich an, um Preisdaten zu laden.";
const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
};

const SERIES_COLORS = [
  "rgb(37, 99, 235)",
  "#db2777",
  "#0ea5e9",
  "#f97316",
  "#16a34a",
  "#8b5cf6",
  "#d946ef",
  "#14b8a6",
];

const normalizeHistory = (history: any[]): PricePoint[] => {
  const normalized = (history || [])
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

  return correctPriceOutliers(normalized);
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
  const idBase = useId();
  const ids = useMemo(
    () => ({
      lineGradientId: `${idBase}-sparkline-line`,
      areaGradientId: `${idBase}-sparkline-area`,
      glowId: `${idBase}-sparkline-glow`,
    }),
    [idBase],
  );

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
      <defs>
        <linearGradient id={ids.lineGradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 0.7)" />
          <stop offset="100%" stopColor="rgb(37, 99, 235)" />
        </linearGradient>
        <linearGradient id={ids.areaGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 0.24)" />
          <stop offset="100%" stopColor="rgba(37, 99, 235, 0)" />
        </linearGradient>
        <filter id={ids.glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <polygon points={areaPoints} fill={`url(#${ids.areaGradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={`url(#${ids.lineGradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${ids.glowId})`}
      />
      <circle cx={lastX} cy={lastY} r={4} fill="rgb(37, 99, 235)" stroke="white" strokeWidth={1.5} />
    </svg>
  );
}

type HistoryChartSeries = {
  id: number;
  label: string;
  color: string;
  data: PricePoint[];
};

type HistoryChartProps = {
  series: HistoryChartSeries[];
};

type HoveredPoint = {
  seriesId: number;
  label: string;
  x: number;
  y: number;
  value: number;
  date: string;
  color: string;
};

function HistoryChart({ series }: HistoryChartProps) {
  const idBase = useId();
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setHoveredPoint(null);
  }, [series]);
  const ids = useMemo(
    () => ({
      lineGradientId: `${idBase}-history-line`,
      areaGradientId: `${idBase}-history-area`,
      glowId: `${idBase}-history-glow`,
      labelShadowId: `${idBase}-history-label-shadow`,
    }),
    [idBase],
  );

  const chartData = useMemo(() => {
    if (!series?.length) return null;

    const normalizedSeries = series
      .map((entry) => {
        const normalizedData = (entry.data || [])
          .map((point) => {
            const timestamp = new Date(point.date_effective).getTime();
            if (!Number.isFinite(timestamp)) return null;
            return {
              ...point,
              timestamp,
            };
          })
          .filter((point): point is PricePoint & { timestamp: number } => point !== null)
          .sort((a, b) => a.timestamp - b.timestamp);
        return {
          ...entry,
          data: normalizedData,
        };
      })
      .filter((entry) => entry.data.length > 0);

    if (!normalizedSeries.length) return null;

    const width = 700;
    const height = 320;
    const paddingX = 56;
    const paddingY = 42;
    const innerWidth = width - paddingX * 2;
    const innerHeight = height - paddingY * 2;

    const values = normalizedSeries.flatMap((entry) =>
      entry.data.map((point) => point.price_per_base_unit_net),
    );
    const timestamps = normalizedSeries.flatMap((entry) =>
      entry.data.map((point) => point.timestamp),
    );
    if (!values.length || !timestamps.length) return null;

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    const actualMinValue = minValue;
    const actualMaxValue = maxValue;
    if (minValue === maxValue) {
      const offset = actualMinValue === 0 ? 1 : Math.abs(actualMinValue) * 0.05 || 1;
      minValue -= offset;
      maxValue += offset;
    }
    const valueRange = maxValue - minValue || 1;

    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const timestampRange = maxTimestamp - minTimestamp || 1;

    const baseline = paddingY + innerHeight;

    const seriesData = normalizedSeries.map((entry) => {
      const points = entry.data.map((point) => {
        const x =
          timestampRange === 0
            ? paddingX + innerWidth / 2
            : paddingX + ((point.timestamp - minTimestamp) / timestampRange) * innerWidth;
        const y =
          valueRange === 0
            ? paddingY + innerHeight / 2
            : paddingY + (1 - (point.price_per_base_unit_net - minValue) / valueRange) * innerHeight;
        return {
          x,
          y,
          timestamp: point.timestamp,
          rawDate: point.date_effective,
          value: point.price_per_base_unit_net,
        };
      });

      const linePath = points
        .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
        .join(" ");

      return {
        id: entry.id,
        label: entry.label,
        color: entry.color,
        points,
        linePath,
        lastPoint: points[points.length - 1],
        lastValue: entry.data[entry.data.length - 1].price_per_base_unit_net,
        lastDate: entry.data[entry.data.length - 1].date_effective,
      };
    });

    const firstSeries = seriesData[0];
    const areaPath =
      seriesData.length === 1
        ? `M${firstSeries.points[0].x} ${baseline} ${firstSeries.points
            .map((point) => `L${point.x} ${point.y}`)
            .join(" ")} L${firstSeries.points[firstSeries.points.length - 1].x} ${baseline} Z`
        : null;

    const sortedUniqueTimestamps = Array.from(new Set(timestamps)).sort((a, b) => a - b);
    const xTickCount = Math.min(4, sortedUniqueTimestamps.length - 1);
    const xTickIndices =
      sortedUniqueTimestamps.length === 1
        ? [0]
        : Array.from({ length: xTickCount + 1 }, (_, index) =>
            Math.round((index / xTickCount) * (sortedUniqueTimestamps.length - 1)),
          );
    const timestampLabelMap = new Map<number, string>();
    normalizedSeries.forEach((entry) => {
      entry.data.forEach((point) => {
        if (!timestampLabelMap.has(point.timestamp)) {
          timestampLabelMap.set(point.timestamp, point.date_effective);
        }
      });
    });

    const xTicks = Array.from(new Set(xTickIndices)).map((idx) => {
      const timestamp = sortedUniqueTimestamps[idx];
      const x =
        timestampRange === 0
          ? paddingX + innerWidth / 2
          : paddingX + ((timestamp - minTimestamp) / timestampRange) * innerWidth;
      const label = timestampLabelMap.get(timestamp);
      return {
        x,
        label: label ? formatDate(label) : formatDate(new Date(timestamp).toISOString()),
      };
    });

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

    return {
      width,
      height,
      paddingX,
      paddingY,
      baseline,
      seriesData,
      areaPath,
      yTicks,
      xTicks,
    };
  }, [series]);

  if (!chartData) return null;

  const { width, height, paddingX, paddingY, baseline, seriesData, areaPath, yTicks, xTicks } =
    chartData;

  const hoveredValueLabel = hoveredPoint ? formatCurrency(hoveredPoint.value) : null;
  const hoveredLabelWidth = hoveredValueLabel ? Math.max(96, hoveredValueLabel.length * 7.2) : 0;
  const hoveredLabelHalfWidth = hoveredLabelWidth / 2;
  const hoveredLabelX = hoveredPoint
    ? Math.min(
        Math.max(hoveredPoint.x, paddingX + hoveredLabelHalfWidth),
        width - paddingX - hoveredLabelHalfWidth,
      )
    : 0;
  const hoveredLabelOffsetX = hoveredPoint ? hoveredLabelX - hoveredPoint.x : 0;

  const singleSeries = seriesData.length === 1 ? seriesData[0] : null;

  const handlePointerMove = useCallback(
    (event: MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;

      const bounds = svgRef.current.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;

      if (
        pointerX < paddingX ||
        pointerX > width - paddingX ||
        pointerY < paddingY ||
        pointerY > baseline
      ) {
        setHoveredPoint((current) => (current ? null : current));
        return;
      }

      let closestPoint: {
        serie: (typeof seriesData)[number];
        point: (typeof seriesData)[number]["points"][number];
        distance: number;
      } | null = null;

      seriesData.forEach((serie) => {
        serie.points.forEach((point) => {
          const dx = point.x - pointerX;
          const dy = point.y - pointerY;
          const distance = dx * dx + dy * dy;

          if (!closestPoint || distance < closestPoint.distance) {
            closestPoint = { serie, point, distance };
          }
        });
      });

      if (!closestPoint) {
        setHoveredPoint((current) => (current ? null : current));
        return;
      }

      const nextHovered: HoveredPoint = {
        seriesId: closestPoint.serie.id,
        label: closestPoint.serie.label,
        x: closestPoint.point.x,
        y: closestPoint.point.y,
        value: closestPoint.point.value,
        date: closestPoint.point.rawDate,
        color: closestPoint.serie.color || "rgb(37, 99, 235)",
      };

      setHoveredPoint((current) => {
        if (
          current &&
          current.seriesId === nextHovered.seriesId &&
          current.x === nextHovered.x &&
          current.y === nextHovered.y
        ) {
          return current;
        }
        return nextHovered;
      });
    },
    [baseline, paddingX, paddingY, seriesData, width],
  );

  return (
    <svg
      className="price-detail__chart"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      ref={svgRef}
      onMouseMove={handlePointerMove}
      onMouseLeave={() => setHoveredPoint(null)}
    >
      <defs>
        <linearGradient id={ids.lineGradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 0.75)" />
          <stop offset="100%" stopColor="rgb(37, 99, 235)" />
        </linearGradient>
        <linearGradient id={ids.areaGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 0.26)" />
          <stop offset="85%" stopColor="rgba(37, 99, 235, 0.08)" />
          <stop offset="100%" stopColor="rgba(37, 99, 235, 0)" />
        </linearGradient>
        <filter id={ids.glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={ids.labelShadowId} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(15, 23, 42, 0.3)" />
        </filter>
      </defs>
      <rect
        x={paddingX}
        y={paddingY}
        width={width - paddingX * 2}
        height={height - paddingY * 2}
        fill="rgba(248, 250, 252, 0.8)"
        stroke="rgba(37, 99, 235, 0.2)"
        strokeWidth={1}
        rx={16}
      />
      {singleSeries && areaPath ? (
        <path d={areaPath} fill={`url(#${ids.areaGradientId})`} stroke="none" />
      ) : null}
      {seriesData.map((serie) => (
        <path
          key={serie.id}
          d={serie.linePath}
          fill="none"
          stroke={
            singleSeries
              ? `url(#${ids.lineGradientId})`
              : serie.color || `url(#${ids.lineGradientId})`
          }
          strokeWidth={3.2}
          strokeLinecap="round"
          filter={singleSeries ? `url(#${ids.glowId})` : undefined}
        />
      ))}
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
      {seriesData.map((serie) =>
        serie.points.map((point, index) => (
          <circle
            key={`${serie.id}-point-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === serie.points.length - 1 && seriesData.length === 1 ? 4 : 2.5}
            fill={serie.color}
            opacity={index === serie.points.length - 1 && seriesData.length === 1 ? 1 : 0.7}
            tabIndex={0}
            onMouseEnter={() =>
              setHoveredPoint({
                seriesId: serie.id,
                label: serie.label,
                x: point.x,
                y: point.y,
                value: point.value,
                date: point.rawDate,
                color: serie.color || "rgb(37, 99, 235)",
              })
            }
            onMouseLeave={() => setHoveredPoint(null)}
            onFocus={() =>
              setHoveredPoint({
                seriesId: serie.id,
                label: serie.label,
                x: point.x,
                y: point.y,
                value: point.value,
                date: point.rawDate,
                color: serie.color || "rgb(37, 99, 235)",
              })
            }
            onBlur={() => setHoveredPoint(null)}
          >
            <title>
              {`${serie.label}: ${formatCurrency(point.value)} (${formatDate(point.rawDate)})`}
            </title>
          </circle>
        )),
      )}
      {hoveredPoint ? (
        <g transform={`translate(${hoveredPoint.x}, ${hoveredPoint.y})`} pointerEvents="none">
          <circle
            r={6}
            fill="white"
            stroke={hoveredPoint.color ?? "rgba(37, 99, 235, 0.4)"}
            strokeWidth={1.5}
          />
          <circle r={4} fill={hoveredPoint.color ?? "rgb(37, 99, 235)"} />
          {hoveredValueLabel ? (
            <g transform={`translate(${hoveredLabelOffsetX}, -16)`}>
              <rect
                x={-hoveredLabelHalfWidth}
                y={-28}
                width={hoveredLabelWidth}
                height={28}
                rx={12}
                fill="rgba(15, 23, 42, 0.84)"
                filter={`url(#${ids.labelShadowId})`}
              />
              <text
                x={0}
                y={-10}
                textAnchor="middle"
                fill="white"
                fontSize={12}
                fontWeight={600}
              >
                {hoveredValueLabel}
              </text>
            </g>
          ) : null}
        </g>
      ) : null}
      {!singleSeries &&
        seriesData.map((serie) =>
          serie.lastPoint ? (
            <g key={`${serie.id}-marker`} transform={`translate(${serie.lastPoint.x}, ${serie.lastPoint.y})`}>
              <circle r={5} fill="white" stroke={serie.color} strokeWidth={2} />
            </g>
          ) : null,
        )}
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
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

  const rangeStartDate = useMemo(() => {
    if (!startDate) return null;
    const parsed = new Date(`${startDate}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [startDate]);

  const rangeEndDate = useMemo(() => {
    if (!endDate) return null;
    const parsed = new Date(`${endDate}T23:59:59.999`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [endDate]);

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

    (async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (isCancelled) return;

      if (sessionError) {
        setMessage(SESSION_ERROR_MESSAGE);
        setIsLoadingHistories(false);
        return;
      }

      if (!session) {
        setMessage(LOGIN_REQUIRED_MESSAGE);
        setIsLoadingHistories(false);
        return;
      }

      setMessage((current) =>
        current === SESSION_ERROR_MESSAGE || current === LOGIN_REQUIRED_MESSAGE ? null : current,
      );

      const results = await Promise.allSettled(
        products.map(async (product) => {
          const params = new URLSearchParams({
            product_id: String(product.id),
          });

          const { data, error } = await supabase.functions.invoke(
            `prices-product-history?${params.toString()}`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${session.access_token}` },
            }
          );

          if (error) {
            throw error;
          }

          return {
            productId: product.id,
            history: normalizeHistory(data),
          };
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
          errorMap[productId] =
            result.reason instanceof FunctionsFetchError
              ? "Preisdaten-Service konnte nicht erreicht werden."
              : "Preisdaten nicht verfügbar.";
        }
      });

      setHistories(historyMap);
      setHistoryErrors(errorMap);
      setIsLoadingHistories(false);
    })();

    return () => {
      isCancelled = true;
    };
  }, [products]);

  const enrichedProducts = useMemo<EnrichedProduct[]>(() => {
    const startTimestamp = rangeStartDate ? rangeStartDate.getTime() : null;
    const endTimestamp = rangeEndDate ? rangeEndDate.getTime() : null;

    return products.map((product) => {
      const originalHistory = histories[product.id] || [];
      const filteredHistory = originalHistory.filter((entry) => {
        const timestamp = new Date(entry.date_effective).getTime();
        if (!Number.isFinite(timestamp)) return false;
        if (startTimestamp !== null && timestamp < startTimestamp) return false;
        if (endTimestamp !== null && timestamp > endTimestamp) return false;
        return true;
      });

      const hasFilteredHistory = filteredHistory.length > 0;
      const firstValue = hasFilteredHistory ? filteredHistory[0].price_per_base_unit_net : null;
      const lastValue = hasFilteredHistory
        ? filteredHistory[filteredHistory.length - 1].price_per_base_unit_net
        : null;
      const changeValue =
        hasFilteredHistory && firstValue !== null && lastValue !== null ? lastValue - firstValue : null;
      const changePercent =
        hasFilteredHistory && typeof firstValue === "number" && firstValue !== 0
          ? ((lastValue! - firstValue) / firstValue) * 100
          : null;

      const rangeStart = hasFilteredHistory ? filteredHistory[0].date_effective : null;
      const rangeEnd = hasFilteredHistory
        ? filteredHistory[filteredHistory.length - 1].date_effective
        : null;

      return {
        ...product,
        history: filteredHistory,
        originalHistory,
        changeValue,
        changePercent,
        firstValue,
        lastValue,
        rangeStart,
        rangeEnd,
        hasHistoryOutsideRange: !hasFilteredHistory && originalHistory.length > 0,
      };
    });
  }, [histories, products, rangeEndDate, rangeStartDate]);

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
      setSelectedProductIds([]);
      return;
    }

    setSelectedProductIds((current) => {
      const visibleIds = new Set(visibleProducts.map((product) => product.id));
      const preserved = current.filter((id) => visibleIds.has(id));
      if (preserved.length) {
        return preserved;
      }
      return [visibleProducts[0].id];
    });
  }, [visibleProducts]);

  const selectionMeta = useMemo(() => {
    const colorMap = new Map<number, string>();
    selectedProductIds.forEach((id, index) => {
      colorMap.set(id, SERIES_COLORS[index % SERIES_COLORS.length]);
    });

    const productMap = new Map(visibleProducts.map((product) => [product.id, product]));
    const entries = selectedProductIds
      .map((id) => {
        const product = productMap.get(id);
        if (!product) return null;
        const color = colorMap.get(id) ?? SERIES_COLORS[0];
        const change = describeChange(product.changeValue, product.changePercent);
        const error = historyErrors[product.id];
        const recentHistory = [...product.history].slice(-20).reverse();
        return { product, color, change, error, recentHistory };
      })
      .filter(
        (
          entry,
        ): entry is {
          product: EnrichedProduct;
          color: string;
          change: ReturnType<typeof describeChange>;
          error: string | undefined;
          recentHistory: PricePoint[];
        } => entry !== null,
      );

    return { entries, colorMap };
  }, [historyErrors, selectedProductIds, visibleProducts]);

  const { entries: selectedEntries, colorMap: selectionColors } = selectionMeta;

  const comparisonSeries = useMemo(
    () =>
      selectedEntries.map((entry) => ({
        id: entry.product.id,
        label: entry.product.name,
        color: entry.color,
        data: entry.product.history,
      })),
    [selectedEntries],
  );

  const hasComparisonData = comparisonSeries.some((serie) => serie.data.length > 0);

  const appliedRangeLabel = useMemo(() => {
    if (!startDate && !endDate) return null;
    const startLabel = startDate ? formatDate(`${startDate}T00:00:00`) : "Beginn";
    const endLabel = endDate ? formatDate(`${endDate}T00:00:00`) : "Heute";
    return `${startLabel} – ${endLabel}`;
  }, [endDate, startDate]);

  const handleProductToggle = (productId: number, shouldSelect: boolean) => {
    setSelectedProductIds((current) => {
      const exists = current.includes(productId);
      if (shouldSelect) {
        if (exists) return current;
        return [...current, productId];
      }
      if (!exists) return current;
      if (current.length === 1) {
        return current;
      }
      return current.filter((id) => id !== productId);
    });
  };

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
              <div className="price-controls__field price-controls__field--range">
                <span className="price-controls__label">Zeitraum</span>
                <div className="price-controls__range-inputs">
                  <input
                    type="date"
                    className="price-controls__input"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(event) => {
                      const value = event.target.value;
                      setStartDate(value);
                      if (endDate && value && value > endDate) {
                        setEndDate("");
                      }
                    }}
                  />
                  <span className="price-controls__range-separator">bis</span>
                  <input
                    type="date"
                    className="price-controls__input"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (startDate && value && value < startDate) {
                        setEndDate(startDate);
                        return;
                      }
                      setEndDate(value);
                    }}
                  />
                </div>
                {(startDate || endDate) && (
                  <button
                    type="button"
                    className="price-controls__range-reset"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                    }}
                  >
                    Zurücksetzen
                  </button>
                )}
              </div>
            </div>
            <div className="price-list-wrapper">
              {visibleProducts.length ? (
                <ul className="price-list">
                  {visibleProducts.map((product) => {
                    const changeDescriptor = describeChange(
                      product.changeValue,
                      product.changePercent,
                    );
                    const isSelected = selectedProductIds.includes(product.id);
                    const selectionColor = selectionColors.get(product.id);
                    const error = historyErrors[product.id];
                    const hasHistory = product.history.length > 0;
                    const showLoading = !hasHistory && !error && isLoadingHistories;
                    const emptyLabel = product.hasHistoryOutsideRange
                      ? "Keine Daten im Zeitraum"
                      : "Keine Preisdaten";

                    return (
                      <li key={product.id}>
                        <label
                          className={`price-list__item ${
                            isSelected ? "price-list__item--active" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="price-list__checkbox"
                            checked={isSelected}
                            onChange={(event) =>
                              handleProductToggle(product.id, event.target.checked)
                            }
                          />
                          <div className="price-list__content">
                            <div className="price-list__heading">
                              <div className="price-list__title-group">
                                <span
                                  className={`price-list__indicator ${
                                    isSelected ? "price-list__indicator--visible" : ""
                                  }`}
                                  style={
                                    selectionColor
                                      ? { backgroundColor: selectionColor }
                                      : undefined
                                  }
                                  aria-hidden="true"
                                />
                                <span className="price-list__name">{product.name}</span>
                              </div>
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
                              <button
                                type="button"
                                className="price-list__solo"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setSelectedProductIds([product.id]);
                                }}
                              >
                                Nur dieses
                              </button>
                            </div>
                            <div className="price-list__sparkline">
                              {hasHistory && <Sparkline data={product.history} />}
                              {!hasHistory && error && (
                                <span className="price-list__state">{error}</span>
                              )}
                              {!hasHistory && !error && showLoading && (
                                <span className="price-list__state">Lade Preisdaten…</span>
                              )}
                              {!hasHistory && !error && !showLoading && (
                                <span className="price-list__state">{emptyLabel}</span>
                              )}
                            </div>
                          </div>
                        </label>
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
            {selectedEntries.length ? (
              <div className="price-detail__content">
                <header className="price-detail__header">
                  <div>
                    <h3>Ausgewählte Produkte</h3>
                    <p>
                      {selectedEntries.length === 1
                        ? `Produkt #${selectedEntries[0].product.id} · ${selectedEntries[0].product.sku}`
                        : `${selectedEntries.length} Produkte ausgewählt`}
                    </p>
                  </div>
                  <div className="price-detail__header-meta">
                    <div>
                      <span className="price-detail__meta-label">Auswahl</span>
                      <strong>{selectedEntries.length}</strong>
                    </div>
                    {appliedRangeLabel && (
                      <div>
                        <span className="price-detail__meta-label">Aktiver Zeitraum</span>
                        <strong>{appliedRangeLabel}</strong>
                      </div>
                    )}
                  </div>
                </header>
                <div className="price-detail__chart-area">
                  {hasComparisonData ? (
                    <HistoryChart series={comparisonSeries} />
                  ) : (
                    <div className="price-detail__empty">
                      {isLoadingHistories
                        ? "Preisdaten werden geladen…"
                        : "Im gewählten Zeitraum liegen keine Preisdaten vor."}
                    </div>
                  )}
                </div>
                {hasComparisonData && (
                  <div className="price-detail__legend">
                    {selectedEntries.map((entry) => (
                      <div key={entry.product.id} className="price-detail__legend-item">
                        <span
                          className="price-detail__legend-dot"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden="true"
                        />
                        <span className="price-detail__legend-name">{entry.product.name}</span>
                        {entry.product.lastValue !== null && (
                          <span className="price-detail__legend-value">
                            {formatCurrency(entry.product.lastValue)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="price-detail__comparison">
                  {selectedEntries.map((entry) => {
                    const { product, change, color, error: productError, recentHistory } = entry;
                    const timeframeLabel =
                      product.history.length > 0 && product.rangeStart && product.rangeEnd
                        ? `${formatDate(product.rangeStart)} – ${formatDate(product.rangeEnd)}`
                        : "–";
                    const changeClass =
                      change?.direction === 1
                        ? "price-detail__change--up"
                        : change?.direction === -1
                        ? "price-detail__change--down"
                        : "";
                    const isHistoryEmpty = product.history.length === 0;

                    return (
                      <article key={product.id} className="price-detail__card">
                        <header className="price-detail__card-header">
                          <span
                            className="price-detail__card-dot"
                            style={{ backgroundColor: color }}
                            aria-hidden="true"
                          />
                          <div className="price-detail__card-title">
                            <h3>{product.name}</h3>
                            <p>#{product.id} · {product.sku}</p>
                          </div>
                          {product.lastValue !== null && (
                            <div className="price-detail__value">
                              <span className="price-detail__value-label">Letzter Preis</span>
                              <strong>{formatCurrency(product.lastValue)}</strong>
                            </div>
                          )}
                        </header>
                        <div className="price-detail__card-meta">
                          <div>
                            <span className="price-detail__meta-label">Zeitraum</span>
                            <strong>{timeframeLabel}</strong>
                          </div>
                          <div>
                            <span className="price-detail__meta-label">Erster Preis</span>
                            <strong>
                              {product.firstValue !== null
                                ? formatCurrency(product.firstValue)
                                : "–"}
                            </strong>
                          </div>
                          <div>
                            <span className="price-detail__meta-label">Veränderung</span>
                            {change ? (
                              <strong className={`price-detail__change ${changeClass}`}>
                                {change.currencyLabel} ({change.percentLabel})
                              </strong>
                            ) : (
                              <strong>–</strong>
                            )}
                          </div>
                        </div>
                        {isHistoryEmpty ? (
                          <div className="price-detail__card-empty">
                            {productError
                              ? productError
                              : isLoadingHistories
                              ? "Preisdaten werden geladen…"
                              : product.hasHistoryOutsideRange
                              ? "Keine Preisdaten im ausgewählten Zeitraum."
                              : "Für dieses Produkt liegen noch keine Preisdaten vor."}
                          </div>
                        ) : (
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
                                  {recentHistory.map((entryItem, index) => (
                                    <tr key={`${entryItem.date_effective}-${index}`}>
                                      <td>{formatDate(entryItem.date_effective)}</td>
                                      <td>{formatCurrency(entryItem.price_per_base_unit_net)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="price-detail__empty">Wählen Sie links mindestens ein Produkt aus.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
