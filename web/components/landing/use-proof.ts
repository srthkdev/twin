"use client";
import useSWRImmutable from "swr/immutable";
import { loadEvals } from "@/lib/data";
import { fetchJson } from "@/hooks/use-json";

interface ChainResult {
  pairs: number;
  brands: number;
  twin: [number, number[]];
  raw: [number, number[]];
  busy: [number, number[]];
  within: [number, number[]];
}

export interface Backtest {
  generatedAt: string;
  sites: number;
  cities: string[];
  classes: { all: ChainResult; taste: ChainResult; convenience: ChainResult };
}

export const percent = (n: number) => `${Math.round(n * 100)}%`;
export const count = (n: number) => n.toLocaleString("en-US");

export function useProof() {
  const backtest = useSWRImmutable("/data/backtest.json", fetchJson<Backtest>, { shouldRetryOnError: false });
  const evals = useSWRImmutable("/data/evals.json", loadEvals, { shouldRetryOnError: false });
  const ready = !backtest.isLoading && !evals.isLoading;
  return {
    backtest: ready ? backtest.data ?? null : null,
    evals: ready ? evals.data ?? null : null,
    failed: ready && !!(backtest.error || evals.error),
  };
}
