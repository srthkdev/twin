"use client";
import { useCallback } from "react";
import { useJson } from "./use-json";
import { useStoredState } from "./use-stored-state";

export interface Pair { from: string; to: string; n?: number }
const RECENT = "twin-recent-pairs";

const readRecent = (): Pair[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? "[]") as Pair[]; } catch { return []; } };

/** Recent pairs (this browser) and the most-opened pairs across visitors. `visit` records one. */
export function usePairs() {
  const [recent, setRecent] = useStoredState<Pair[]>(RECENT, []);
  const { data, error } = useJson<{ top: Pair[] }>("/api/pairs");
  const visit = useCallback((from: string, to: string) => {
    const next = [{ from, to }, ...readRecent().filter((p) => p.from !== from || p.to !== to)].slice(0, 5);
    setRecent(next);
    // count each pair once per session
    const k = `twin-counted:${from}>${to}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* still count */ }
    void fetch("/api/pairs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, to }) }).catch(() => {});
  }, [setRecent]);
  return { recent, popular: data?.top ?? [], error, visit };
}
