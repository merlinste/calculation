import { useEffect, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type RawRecord = Record<string, unknown>;

type IngredientDetails = {
  id: number;
  name: string;
  sku: string | null;
  farmingType: string | null;
  isOrganic: boolean;
  isConventional: boolean;
};

type LotInfo = {
  id: string;
  code: string;
  available: number;
  bestBefore: string | null;
  quality: string | null;
};

export type LotAllocation = {
  lotId: string;
  lotCode: string;
  availableBeforeAllocation: number;
  allocated: number;
  bestBefore: string | null;
};

export type ProductionComponent = {
  ingredientId: number | null;
  ingredientName: string;
  ingredientSku: string | null;
  ratio: number | null;
  grams: number | null;
  farmingType: string | null;
  allocations: LotAllocation[];
  shortage: number;
};

export type ProductionBlueprint = {
  product: {
    id: number;
    name: string;
    sku: string | null;
    batchGrams: number | null;
    farmingType: string | null;
    isOrganic: boolean;
    isConventional: boolean;
  };
  components: ProductionComponent[];
};

export type ProductionBlueprintState = {
  blueprint: ProductionBlueprint | null;
  loading: boolean;
  error: string | null;
};

const numberKeys = [
  "grams",
  "gram",
  "amount_grams",
  "quantity_grams",
  "qty_grams",
  "qty",
  "quantity",
  "qty_required",
  "required_quantity",
  "batch_weight_grams",
  "batch_size_grams",
  "target_batch_grams",
  "target_batch_weight_grams",
  "net_weight_grams",
  "net_weight",
  "content_grams",
  "weight_grams",
  "mass_grams",
  "available_quantity",
  "available_qty",
  "quantity_available",
  "remaining_quantity",
  "qty_remaining",
];

const stringKeys = [
  "name",
  "display_name",
  "ingredient_name",
  "component_name",
  "product_name",
  "lot_code",
  "lot_no",
  "lot_number",
  "batch",
  "batch_code",
  "code",
  "sku",
  "ingredient_sku",
  "component_sku",
  "product_sku",
];

const booleanKeys = [
  "is_organic",
  "organic",
  "bio",
  "is_bio",
  "is_conventional",
  "conventional",
  "konventionell",
];

const dateKeys = [
  "best_before_date",
  "best_before",
  "expiry_date",
  "expires_at",
  "roasted_at",
  "production_date",
  "produced_at",
  "received_at",
  "created_at",
  "updated_at",
];

const recipeTableCandidates = [
  "product_recipe_items",
  "product_recipes",
  "production_recipe_items",
  "production_recipes",
  "recipe_components",
  "recipes",
];

const lotTableCandidates = [
  "inventory_lots_view",
  "inventory_lots",
  "available_lots",
  "lots",
  "stock_lots",
  "product_lots",
];

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, "").replace(/,/g, ".");
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["1", "true", "yes", "y", "ja"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "nein"].includes(normalized)) return false;
  }
  return null;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const pickFirst = <T>(record: RawRecord, keys: readonly string[], parser: (value: unknown) => T | null): T | null => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = parser(record[key]);
      if (value !== null) return value;
    }
  }
  return null;
};

const pickNumber = (record: RawRecord, additionalKeys: string[] = []): number | null =>
  pickFirst(record, [...additionalKeys, ...numberKeys], toNumber);

const pickString = (record: RawRecord, additionalKeys: string[] = []): string | null =>
  pickFirst(record, [...additionalKeys, ...stringKeys], toStringValue);

const pickBoolean = (record: RawRecord, additionalKeys: string[] = []): boolean | null =>
  pickFirst(record, [...additionalKeys, ...booleanKeys], toBoolean);

const pickDate = (record: RawRecord, additionalKeys: string[] = []): string | null =>
  pickFirst(record, [...additionalKeys, ...dateKeys], toStringValue);

const normalizeQuality = (
  value: string | null,
  flags?: { isOrganic?: boolean; isConventional?: boolean },
): string | null => {
  if (value) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["bio", "organic", "öko", "oekologisch", "ecologic", "ecological", "organic certified"].some((token) => normalized.includes(token))) {
      return "bio";
    }
    if (["konventionell", "conventional", "conv", "standard"].some((token) => normalized.includes(token))) {
      return "konventionell";
    }
  }
  if (flags?.isOrganic) return "bio";
  if (flags?.isConventional) return "konventionell";
  return null;
};

const fetchFromCandidates = async (
  candidates: string[],
  loader: (table: string) => Promise<{ data: RawRecord[]; error: PostgrestError | null }>,
): Promise<{ table: string | null; rows: RawRecord[]; error: PostgrestError | null }> => {
  let lastError: PostgrestError | null = null;
  for (const table of candidates) {
    const { data, error } = await loader(table);
    if (!error) {
      return { table, rows: data, error: null };
    }
    lastError = error;
  }
  return { table: null, rows: [], error: lastError };
};

const mapRecipeRows = (rows: RawRecord[]): RawRecord[] => rows.map((row) => ({ ...row }));

const fetchRecipeRows = async (productId: number): Promise<RawRecord[]> => {
  const { rows } = await fetchFromCandidates(recipeTableCandidates, async (table) => {
    const query = supabase.from(table).select("*").eq("product_id", productId);
    const { data, error } = await query;
    return { data: (data as RawRecord[]) ?? [], error };
  });
  return mapRecipeRows(rows);
};

const fetchIngredientDetails = async (ingredientIds: number[]): Promise<Map<number, IngredientDetails>> => {
  if (!ingredientIds.length) return new Map();
  const uniqueIds = Array.from(new Set(ingredientIds));
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .in("id", uniqueIds);
  if (error) {
    return new Map();
  }
  const map = new Map<number, IngredientDetails>();
  for (const entry of data ?? []) {
    const record = entry as RawRecord;
    const id = toNumber(record.id) ?? pickNumber(record, ["product_id"]);
    if (!id) continue;
    const name = pickString(record, ["name", "product_name"]) ?? `Produkt #${id}`;
    const sku = pickString(record, ["sku", "product_sku"]);
    const isOrganic = Boolean(pickBoolean(record, ["is_organic", "organic", "bio"]) ?? false);
    const isConventional = Boolean(pickBoolean(record, ["is_conventional", "conventional"]) ?? false);
    const farmingType = normalizeQuality(
      pickString(record, ["farming_type", "quality", "farming"]),
      { isOrganic, isConventional },
    );
    map.set(id, {
      id,
      name,
      sku,
      farmingType,
      isOrganic,
      isConventional,
    });
  }
  return map;
};

const fetchLotsForIngredient = async (ingredientId: number): Promise<LotInfo[]> => {
  const { rows } = await fetchFromCandidates(lotTableCandidates, async (table) => {
    const query = supabase.from(table).select("*").eq("product_id", ingredientId);
    const { data, error } = await query;
    return { data: (data as RawRecord[]) ?? [], error };
  });

  return rows
    .map((row) => {
      const record = row as RawRecord;
      const idRaw = pickString(record, ["id", "lot_id", "uuid"]);
      const id = idRaw ?? (pickNumber(record, ["id", "lot_id"]) != null ? String(pickNumber(record, ["id", "lot_id"])) : null);
      const code =
        pickString(record, ["lot_code", "lot_no", "lot_number", "batch", "batch_code", "code", "identifier"]) ??
        (id ? `Lot ${id}` : "Unbekannt");
      const available = pickNumber(record, [
        "available_quantity",
        "available_qty",
        "quantity_available",
        "qty_available",
        "qty_remaining",
        "remaining_quantity",
        "quantity",
        "qty",
      ]) ?? 0;
      const bestBefore = pickDate(record, []);
      const quality = normalizeQuality(
        pickString(record, ["quality", "farming_type", "certification", "grade"]),
        {
          isOrganic: pickBoolean(record, ["is_organic", "organic", "bio"]) ?? undefined,
          isConventional: pickBoolean(record, ["is_conventional", "conventional"]) ?? undefined,
        },
      );
      if (!id) return null;
      return {
        id,
        code,
        available: Math.max(0, available),
        bestBefore,
        quality,
      };
    })
    .filter((lot): lot is LotInfo => Boolean(lot && lot.available > 0));
};

const compareByDateThenCode = (a: LotInfo, b: LotInfo): number => {
  const dateA = a.bestBefore ?? "";
  const dateB = b.bestBefore ?? "";
  if (dateA && dateB) {
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
  } else if (dateA) {
    return -1;
  } else if (dateB) {
    return 1;
  }
  if (a.code < b.code) return -1;
  if (a.code > b.code) return 1;
  return 0;
};

const allocateLots = (
  lots: LotInfo[],
  required: number | null,
  preferredQuality: string | null,
): { allocations: LotAllocation[]; shortage: number } => {
  if (!required || required <= 0) {
    return { allocations: [], shortage: 0 };
  }
  const sorted = [...lots].sort(compareByDateThenCode);
  let remaining = required;
  const allocations: LotAllocation[] = [];
  for (const lot of sorted) {
    if (preferredQuality && lot.quality && lot.quality !== preferredQuality) {
      continue;
    }
    if (remaining <= 0) break;
    const use = Math.min(remaining, lot.available);
    if (use <= 0) continue;
    allocations.push({
      lotId: lot.id,
      lotCode: lot.code,
      availableBeforeAllocation: lot.available,
      allocated: Number(use.toFixed(3)),
      bestBefore: lot.bestBefore,
    });
    remaining = Math.max(0, remaining - use);
  }
  return { allocations, shortage: Number(remaining.toFixed(3)) };
};

const extractIngredientId = (record: RawRecord): number | null => {
  const id = pickNumber(record, [
    "ingredient_product_id",
    "component_product_id",
    "ingredient_id",
    "component_id",
    "product_component_id",
    "child_product_id",
  ]);
  if (id == null) return null;
  return Math.trunc(id);
};

const extractRatio = (record: RawRecord): number | null => {
  const ratio = pickNumber(record, ["ratio", "percentage", "share", "portion", "part"]);
  if (ratio == null) return null;
  if (ratio > 1) {
    if (ratio <= 100) {
      return ratio / 100;
    }
    return ratio;
  }
  return ratio;
};

const extractGrams = (record: RawRecord, batchGrams: number | null, ratio: number | null): number | null => {
  const grams = pickNumber(record, ["grams", "quantity_grams", "qty_grams", "weight_grams"]);
  if (grams != null) return grams;
  if (batchGrams != null && ratio != null) {
    const computed = batchGrams * ratio;
    if (Number.isFinite(computed)) {
      return Number(Number.parseFloat(String(computed)).toFixed(3));
    }
  }
  const qty = pickNumber(record, ["qty", "quantity"]);
  return qty != null ? qty : null;
};

const extractFarmingPreference = (
  record: RawRecord,
  ingredient: IngredientDetails | undefined,
  fallbackProduct: { farmingType: string | null; isOrganic: boolean; isConventional: boolean },
): string | null => {
  const direct = normalizeQuality(
    pickString(record, ["farming_type", "quality", "grade"]),
    {
      isOrganic: pickBoolean(record, ["is_organic", "organic", "bio"]) ?? undefined,
      isConventional: pickBoolean(record, ["is_conventional", "conventional"]) ?? undefined,
    },
  );
  if (direct) return direct;
  if (ingredient?.farmingType) return ingredient.farmingType;
  if (fallbackProduct.farmingType) return fallbackProduct.farmingType;
  if (fallbackProduct.isOrganic) return "bio";
  if (fallbackProduct.isConventional) return "konventionell";
  return null;
};

export const useProductionBlueprint = (productId: number | null): ProductionBlueprintState => {
  const [state, setState] = useState<ProductionBlueprintState>({ blueprint: null, loading: false, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!productId) {
      setState({ blueprint: null, loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const { data: productData, error: productError } = await supabase
          .from("products")
          .select("*")
          .eq("id", productId)
          .maybeSingle();
        if (productError) {
          throw new Error(productError.message);
        }
        if (!productData) {
          throw new Error("Produkt konnte nicht geladen werden.");
        }
        const productRecord = productData as RawRecord;
        const name = pickString(productRecord, ["name", "product_name"]) ?? `Produkt #${productId}`;
        const sku = pickString(productRecord, ["sku", "product_sku"]);
        const batchGrams = pickNumber(productRecord, [
          "batch_size_grams",
          "batch_weight_grams",
          "target_batch_grams",
          "target_batch_weight_grams",
          "net_weight_grams",
          "net_weight",
          "content_grams",
          "weight_grams",
        ]);
        const isOrganic = Boolean(pickBoolean(productRecord, ["is_organic", "organic", "bio"]) ?? false);
        const isConventional = Boolean(pickBoolean(productRecord, ["is_conventional", "conventional"]) ?? false);
        const farmingType = normalizeQuality(
          pickString(productRecord, ["farming_type", "quality", "grade"]),
          { isOrganic, isConventional },
        );

        const recipeRows = await fetchRecipeRows(productId);
        const ingredientIds = recipeRows
          .map((row) => extractIngredientId(row))
          .filter((id): id is number => id != null && Number.isFinite(id));
        const ingredientDetails = await fetchIngredientDetails(ingredientIds);

        const components: ProductionComponent[] = [];
        for (const row of recipeRows) {
          const ingredientId = extractIngredientId(row);
          const ingredientDetail = ingredientId != null ? ingredientDetails.get(ingredientId) : undefined;
          const ingredientName =
            pickString(row, ["ingredient_name", "component_name", "child_name"]) ??
            ingredientDetail?.name ??
            (ingredientId != null ? `Zutat #${ingredientId}` : "Unbekannte Zutat");
          const ingredientSku = pickString(row, ["ingredient_sku", "component_sku"]) ?? ingredientDetail?.sku ?? null;
          const ratio = extractRatio(row);
          const grams = extractGrams(row, batchGrams, ratio);
          const componentFarming = extractFarmingPreference(row, ingredientDetail, {
            farmingType,
            isOrganic,
            isConventional,
          });

          let allocations: LotAllocation[] = [];
          let shortage = grams != null ? grams : 0;
          if (ingredientId != null) {
            const lots = await fetchLotsForIngredient(ingredientId);
            const result = allocateLots(lots, grams, componentFarming);
            allocations = result.allocations;
            shortage = result.shortage;
          }

          components.push({
            ingredientId,
            ingredientName,
            ingredientSku,
            ratio,
            grams,
            farmingType: componentFarming,
            allocations,
            shortage,
          });
        }

        const blueprint: ProductionBlueprint = {
          product: {
            id: productId,
            name,
            sku,
            batchGrams,
            farmingType,
            isOrganic,
            isConventional,
          },
          components,
        };

        if (!cancelled) {
          setState({ blueprint, loading: false, error: null });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!cancelled) {
          setState({ blueprint: null, loading: false, error: message });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  return state;
};
