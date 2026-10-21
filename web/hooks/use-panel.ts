"use client";
import { useCallback, useRef, type SetStateAction } from "react";
import { useEventCallback } from "usehooks-ts";
import { useStoredState } from "./use-stored-state";

/** A side panel's width + collapsed state, persisted per panel. `side` says which edge the drag handle sits on. */
export function usePanel(key: string, init: number, min: number, max: number, side: "left" | "right") {
  const [panel, setPanel] = useStoredState<{ width?: number; collapsed?: boolean } | null>(`twin.panel.${key}`, { width: init, collapsed: false });
  const width = Math.min(max, Math.max(min, panel?.width || init));
  const collapsed = panel?.collapsed ?? false;
  const setCollapsed = useEventCallback((update: SetStateAction<boolean>) => {
    setPanel((p) => ({ width: Math.min(max, Math.max(min, p?.width || init)), collapsed: update instanceof Function ? update(p?.collapsed ?? false) : update }));
  });

  const drag = useRef<{ x: number; w: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width };
  }, [width]);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const width = Math.min(max, Math.max(min, drag.current.w + (side === "left" ? dx : -dx)));
    setPanel((p) => ({ width, collapsed: p?.collapsed ?? false }));
  }, [min, max, side, setPanel]);
  const onPointerUp = useCallback(() => { drag.current = null; }, []);
  return { width, collapsed, setCollapsed, handle: { onPointerDown, onPointerMove, onPointerUp } };
}
