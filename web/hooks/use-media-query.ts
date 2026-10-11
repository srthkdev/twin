"use client";
import { useSyncExternalStore } from "react";

export function useMediaQuery(q: string, server = true) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(q); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(q).matches,
    () => server,
  );
}
