"use client";
import { useCallback, useEffect, useState } from "react";

export interface Pair { from: string; to: string; n?: number }
const RECENT = "twin-recent-pairs";

const readRecent = (): Pair[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? "[]") as Pair[]; } catch { return []; } };

/** Recent pairs (this browser) and the most-opened pairs across visitors. `visit` records one. */
export function usePairs() {
  const [recent, setRecent] = useState<Pair[]>([]);
  const [popular, setPopular] = useState<Pair[]>([]);
  useEffect(() => {
    setRecent(readRecent());
    fetch("/api/pairs").then((r) => r.json() as Promise<{ top: Pair[] }>).then((d) => setPopular(d.top ?? [])).catch(() => {});
  }, []);
  const visit = useCallback((from: string, to: string) => {
    const next = [{ from, to }, ...readRecent().filter((p) => p.from !== from || p.to !== to)].slice(0, 5);
    try { localStorage.setItem(RECENT, JSON.stringify(next)); } catch { /* storage blocked */ }
    setRecent(next);
    // count each pair once per session
    const k = `twin-counted:${from}>${to}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* still count */ }
    void fetch("/api/pairs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, to }) }).catch(() => {});
  }, []);
  return { recent, popular, visit };
}
