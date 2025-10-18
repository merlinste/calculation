import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type ProductOption = {
  id: number;
  sku: string;
  name: string;
  active: boolean | null;
};

export type ProductOptionsResult = {
  products: ProductOption[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useProductOptions(): ProductOptionsResult {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("products")
      .select("id, sku, name, active")
      .order("name", { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setProducts([]);
    } else {
      const list = (data ?? []).map((item) => ({
        id: item.id as number,
        sku: item.sku as string,
        name: item.name as string,
        active: (item.active as boolean | null) ?? null,
      }));
      setProducts(list.filter((item) => item.active !== false));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    products,
    loading,
    error,
    refresh: load,
  };
}
