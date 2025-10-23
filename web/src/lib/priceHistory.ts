import { supabase } from "./supabase";

export type PricePointLike = {
  date_effective: string;
  price_per_base_unit_net: number;
};

const median = (values: number[]): number => {
  if (!values.length) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const correctPriceOutliers = <T extends PricePointLike>(
  history: readonly T[],
  options?: {
    threshold?: number;
  },
): T[] => {
  if (!history.length) {
    return [];
  }

  const threshold = options?.threshold ?? 3.5;
  const priceValues = history.map((point) => point.price_per_base_unit_net);
  if (priceValues.every((value) => value === priceValues[0])) {
    return history.map((point) => ({ ...point }));
  }

  const medianValue = median(priceValues);
  if (!isFiniteNumber(medianValue)) {
    return history.map((point) => ({ ...point }));
  }

  const absoluteDeviations = priceValues.map((value) => Math.abs(value - medianValue));
  const mad = median(absoluteDeviations);
  if (!isFiniteNumber(mad) || mad === 0) {
    return history.map((point) => ({ ...point }));
  }

  const flagged = priceValues.map((value) => {
    const zScore = (0.6745 * (value - medianValue)) / mad;
    return Math.abs(zScore) > threshold;
  });

  if (!flagged.some(Boolean)) {
    return history.map((point) => ({ ...point }));
  }

  const corrected: T[] = history.map((point, index) => {
    if (!flagged[index]) {
      return { ...point };
    }

    let previousIndex = index - 1;
    while (previousIndex >= 0 && flagged[previousIndex]) {
      previousIndex -= 1;
    }

    let nextIndex = index + 1;
    while (nextIndex < history.length && flagged[nextIndex]) {
      nextIndex += 1;
    }

    const previousValue = previousIndex >= 0 ? priceValues[previousIndex] : undefined;
    const nextValue = nextIndex < history.length ? priceValues[nextIndex] : undefined;

    let replacement: number | undefined;
    if (isFiniteNumber(previousValue) && isFiniteNumber(nextValue)) {
      replacement = (previousValue + nextValue) / 2;
    } else if (isFiniteNumber(previousValue)) {
      replacement = previousValue;
    } else if (isFiniteNumber(nextValue)) {
      replacement = nextValue;
    } else {
      replacement = medianValue;
    }

    return {
      ...point,
      price_per_base_unit_net: replacement,
    };
  });

  return corrected;
};

export type PriceHistoryCorrectionResult = {
  id: number;
  product_id: number;
  date_effective: string;
  uom: string | null;
  qty_in_base_units: number | null;
  source_item_id: number | null;
  previous_price_per_base_unit_net: number;
  price_per_base_unit_net: number;
  invoice_id: number | null;
  invoice_no: string | null;
  invoice_date: string | null;
  did_update: boolean;
};

export const applyPriceHistoryCorrection = async ({
  historyId,
  correctedPrice,
}: {
  historyId: number;
  correctedPrice: number;
}): Promise<PriceHistoryCorrectionResult> => {
  if (!Number.isFinite(historyId) || historyId <= 0) {
    throw new Error("Ungültige History-ID.");
  }
  if (!Number.isFinite(correctedPrice)) {
    throw new Error("Ungültiger Preiswert.");
  }

  const normalizedHistoryId = Math.trunc(historyId);
  if (normalizedHistoryId <= 0) {
    throw new Error("Ungültige History-ID.");
  }

  const roundedPrice = Number(correctedPrice.toFixed(4));

  const { data, error } = await supabase.functions.invoke("prices-product-history", {
    body: {
      correction: {
        history_id: normalizedHistoryId,
        price_per_base_unit_net: roundedPrice,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Konnte Antwort nicht verarbeiten.");
  }

  const updated = (data as { updated?: PriceHistoryCorrectionResult }).updated;
  if (!updated) {
    throw new Error("Korrektur konnte nicht gespeichert werden.");
  }

  return {
    ...updated,
    previous_price_per_base_unit_net: Number(updated.previous_price_per_base_unit_net),
    price_per_base_unit_net: Number(updated.price_per_base_unit_net),
  };
};
