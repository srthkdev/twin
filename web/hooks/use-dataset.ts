"use client";
import { useEffect, useState } from "react";
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
  return { ds, error };
}
