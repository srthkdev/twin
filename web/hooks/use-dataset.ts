"use client";
import { useCallback } from "react";
import { useJson } from "./use-json";
import { loadDataSet } from "@/lib/data";

export function useDataset() {
  const { data, error, mutate } = useJson("twin:dataset", loadDataSet);
  /** Re-read the city list (after a city is added) and resolve with the fresh dataset. */
  const refresh = useCallback(async () => {
    const ds = await loadDataSet();
    await mutate(ds, { revalidate: false });
    return ds;
  }, [mutate]);
  return { ds: data ?? null, error: error ? String(error) : null, refresh };
}
