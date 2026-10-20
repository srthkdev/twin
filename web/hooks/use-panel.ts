"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** A side panel's width + collapsed state, persisted per panel. `side` says which edge the drag handle sits on. */
export function usePanel(key: string, init: number, min: number, max: number, side: "left" | "right") {
  const [width, setWidth] = useState(init);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`twin.panel.${key}`) ?? "null") as { width?: number; collapsed?: boolean } | null;
      if (s?.width) setWidth(Math.min(max, Math.max(min, s.width)));
      if (s?.collapsed) setCollapsed(true);
    } catch { /* storage unavailable */ }
  }, [key, min, max]);
  useEffect(() => { try { localStorage.setItem(`twin.panel.${key}`, JSON.stringify({ width, collapsed })); } catch { /* ignore */ } }, [key, width, collapsed]);

  const drag = useRef<{ x: number; w: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width };
  }, [width]);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    setWidth(Math.min(max, Math.max(min, drag.current.w + (side === "left" ? dx : -dx))));
  }, [min, max, side]);
  const onPointerUp = useCallback(() => { drag.current = null; }, []);
  return { width, collapsed, setCollapsed, handle: { onPointerDown, onPointerMove, onPointerUp } };
}
