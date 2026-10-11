"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { PickingInfo } from "@deck.gl/core";

export const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface DeckMapOptions {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
  interactive?: boolean;
  onClick?: (info: PickingInfo) => void;
  getTooltip?: (info: PickingInfo) => { html: string; style?: Record<string, string> } | null;
}

/** Creates a MapLibre globe map with an interleaved deck.gl overlay. Returns refs; layers are set imperatively. */
export function useDeckMap(opts: DeckMapOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const o = optsRef.current;
    const map = new maplibregl.Map({
      container: el,
      style: STYLE_URL,
      center: o.center,
      zoom: o.zoom,
      pitch: o.pitch ?? 0,
      bearing: o.bearing ?? 0,
      interactive: o.interactive ?? true,
      attributionControl: { compact: true },
      maxPitch: 75,
      canvasContextAttributes: { antialias: true },
    });
    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      onClick: (info: PickingInfo) => optsRef.current.onClick?.(info),
      getTooltip: (info: PickingInfo) => optsRef.current.getTooltip?.(info) ?? null,
    });
    map.addControl(overlay as unknown as maplibregl.IControl);
    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
      try {
        map.setSky({
          "sky-color": "#0b0b0a",
          "horizon-color": "#2a2621",
          "fog-color": "#0b0b0a",
          "sky-horizon-blend": 0.6,
          "horizon-fog-blend": 0.5,
          "fog-ground-blend": 0.25,
          "atmosphere-blend": 0,
        });
      } catch { /* sky unsupported */ }
      warmBasemap(map);
    });
    mapRef.current = map;
    overlayRef.current = overlay;
    map.once("load", () => setReady(true));
    return () => {
      setReady(false);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  return { containerRef, mapRef, overlayRef, ready };
}

/** Re-ink CARTO dark-matter in Twin's warm greys so the map sits in the same palette as the UI. */
function warmBasemap(map: maplibregl.Map) {
  for (const l of map.getStyle().layers ?? []) {
    const id = l.id;
    try {
      if (l.type === "background") map.setPaintProperty(id, "background-color", "#11110f");
      else if (l.type === "fill" && /water/.test(id)) map.setPaintProperty(id, "fill-color", "#0b0b0a");
      else if (l.type === "fill" && /building/.test(id)) map.setPaintProperty(id, "fill-color", "#191815");
      else if (l.type === "fill") map.setPaintProperty(id, "fill-color", "#141411");
      else if (l.type === "line" && /water/.test(id)) map.setPaintProperty(id, "line-color", "#0b0b0a");
      else if (l.type === "line" && /boundary|admin/.test(id)) map.setPaintProperty(id, "line-color", "#3a3833");
      else if (l.type === "line") map.setPaintProperty(id, "line-color", "#22211d");
      else if (l.type === "symbol") {
        map.setPaintProperty(id, "text-color", "#6f6c64");
        map.setPaintProperty(id, "text-halo-color", "#0b0b0a");
      }
    } catch { /* layer without that paint property */ }
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Spherical interpolation between two lon/lat points. */
export function slerpLonLat(a: [number, number], b: [number, number], t: number): [number, number] {
  const r = Math.PI / 180;
  const [l1, p1, l2, p2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r];
  const v1 = [Math.cos(p1) * Math.cos(l1), Math.cos(p1) * Math.sin(l1), Math.sin(p1)];
  const v2 = [Math.cos(p2) * Math.cos(l2), Math.cos(p2) * Math.sin(l2), Math.sin(p2)];
  const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  const w = Math.acos(dot);
  if (w < 1e-6) return a;
  const s = Math.sin(w);
  const k1 = Math.sin((1 - t) * w) / s, k2 = Math.sin(t * w) / s;
  const v = [k1 * v1[0] + k2 * v2[0], k1 * v1[1] + k2 * v2[1], k1 * v1[2] + k2 * v2[2]];
  return [Math.atan2(v[1], v[0]) / r, Math.asin(v[2]) / r];
}

/** Great-circle distance in km. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface ArcSeg { path: [number, number, number][]; color: [number, number, number, number] }
/** Great-circle arc with altitude, split in segments that brighten from bone to amber, from t=0 to tEnd. Works on globe and mercator. */
export function arcSegments(a: [number, number], b: [number, number], tEnd = 1, n = 40, alpha = 255, heightFrac = 0.16): ArcSeg[] {
  const km = haversineKm(a, b);
  const h = km * 1000 * heightFrac;
  const pt = (t: number): [number, number, number] => { const p = slerpLonLat(a, b, t); return [p[0], p[1], Math.sin(Math.PI * t) * h]; };
  const segs: ArcSeg[] = [];
  const m = Math.max(1, Math.round(n * Math.min(1, tEnd)));
  for (let i = 0; i < m; i++) {
    const t0 = (i / n), t1 = Math.min(tEnd, (i + 1) / n);
    const c = (t0 + t1) / 2;
    segs.push({ path: [pt(t0), pt(t1)], color: [Math.round(230 + (240 - 230) * c), Math.round(227 + (160 - 227) * c), Math.round(218 + (60 - 218) * c), alpha] });
  }
  return segs;
}
