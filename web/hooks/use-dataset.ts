"use client";
import { useCallback } from "react";
import { useJson } from "./use-json";
import { loadDataSet } from "@/lib/data";
import type { DataSet } from "@/lib/types";

/** `onLoad` runs when the dataset arrives (not on later refreshes), for work that needs it once. */
export function useDataset(onLoad?: (ds: DataSet) => void) {
  const { data, error, mutate } = useJson("twin:dataset", loadDataSet, onLoad ? { onSuccess: onLoad } : undefined);
  /** Re-read the city list (after a city is added) and resolve with the fresh dataset. */
  const refresh = useCallback(async () => {
    const ds = await loadDataSet();
    await mutate(ds, { revalidate: false });
    return ds;
  }, [mutate]);
  return { ds: data ?? null, error: error ? String(error) : null, refresh };
}
