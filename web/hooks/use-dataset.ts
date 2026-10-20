"use client";
import { useCallback, useEffect, useState } from "react";
import { loadDataSet } from "@/lib/data";
import type { DataSet } from "@/lib/types";

export function useDataset() {
  const [ds, setDs] = useState<DataSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadDataSet().then((d) => alive && setDs(d)).catch((e) => alive && setError(String(e)));
    return () => { alive = false; };
  }, []);
  /** Re-read the city list (after a city is added) and resolve with the fresh dataset. */
  const refresh = useCallback(async () => {
    const d = await loadDataSet();
    setDs(d);
    return d;
  }, []);
  return { ds, error, refresh };
}
