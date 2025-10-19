import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type SupplierOption = {
  id: number;
  name: string;
};

export type SupplierOptionsResult = {
  suppliers: SupplierOption[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useSupplierOptions(): SupplierOptionsResult {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("suppliers")
      .select("id, name")
      .order("name", { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setSuppliers([]);
    } else {
      const list = (data ?? []).map((item) => ({
        id: item.id as number,
        name: item.name as string,
      }));
      setSuppliers(list);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    suppliers,
    loading,
    error,
    refresh: load,
  };
}
