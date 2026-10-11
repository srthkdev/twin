"use client";
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { ColumnLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { arcSegments, useDeckMap, type ArcSeg } from "./use-deck-map";
import { colorAt, type PaletteName } from "@/lib/colors";
import { normalizeRobust } from "@/lib/similarity";
import type { City, Hood, PackedCells } from "@/lib/types";

export interface MapTwin { hood: Hood; score: number }
export interface SourcePoint { lon: number; lat: number; name: string; cityId: string }
export type Mode = "twin" | "raw";

export interface ExploreMapProps {
  source: SourcePoint | null;
  sourceCity: City | null;
  targetCity: City | null;
  srcCells: PackedCells | null;
  tgtCells: PackedCells | null;
  srcSim: Float32Array | null;
  tgtSim: Float32Array | null;
  mode: Mode;
  twins: MapTwin[];
  selectedTwin: string | null;
  basketLabels: string[];
  onPickSourceCell: (i: number) => void;
  onSelectTwin: (id: string) => void;
  onFlightState?: (flying: boolean) => void;
}

interface ColumnData {
  length: number;
  attributes: { getPosition: { value: Float64Array; size: 2 }; getElevation: { value: Float32Array; size: 1 }; getFillColor: { value: Uint8ClampedArray; size: 4 } };
  t: Float32Array;
}

function buildColumns(cells: PackedCells, vals: Float32Array, pal: PaletteName, maxElev: number): ColumnData & { lo: number; hi: number } {
  const { t, lo, hi } = normalizeRobust(vals);
  const n = cells.n;
  const pos = new Float64Array(n * 2), elev = new Float32Array(n), fill = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 2] = cells.lon[i]; pos[i * 2 + 1] = cells.lat[i];
    const c = colorAt(pal, t[i]);
    fill.set(c, i * 4);
    elev[i] = 25 + Math.pow(t[i], 2.2) * maxElev;
  }
  return { length: n, attributes: { getPosition: { value: pos, size: 2 }, getElevation: { value: elev, size: 1 }, getFillColor: { value: fill, size: 4 } }, t, lo, hi };
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function ExploreMap(props: ExploreMapProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const anim = useRef({ arc: 0, reveal: 0, flightStart: 0, flying: false, lastTarget: "" as string, revealStart: 0 });

  const { containerRef, mapRef, overlayRef, ready } = useDeckMap({
    center: [-118.3, 34.05], zoom: 9, pitch: 45, bearing: -10,
    onClick: (info: PickingInfo) => {
      if (info.layer?.id === "src-cells" && info.index >= 0) propsRef.current.onPickSourceCell(info.index);
    },
    getTooltip: (info: PickingInfo) => {
      const p = propsRef.current;
      if (info.index < 0 || !info.layer) return null;
      const isTgt = info.layer.id === "tgt-cells";
      const cells = isTgt ? p.tgtCells : p.srcCells;
      const sim = isTgt ? p.tgtSim : p.srcSim;
      if (!cells || !sim) return null;
      const i = info.index;
      const top = cells.top[i].map((k) => p.basketLabels[k]).join(" · ");
      const val = p.mode === "raw" ? `raw density ${cells.d[i].toFixed(2)}` : `similarity ${sim[i].toFixed(2)}`;
      return {
        html: `<div style="font-family:var(--font-geist-mono),monospace;font-size:11px;color:#9aa3b8">${cells.g[i]}</div><div style="font-weight:600;margin:2px 0">${val}</div><div style="color:#cbd5e1">${top}</div>${!isTgt ? '<div style="margin-top:4px;color:#67e8f9">Click to drop a pin</div>' : ""}`,
        style: { background: "rgba(10,11,17,.92)", border: "1px solid rgba(255,255,255,.12)", borderRadius: "10px", padding: "8px 10px", color: "#fff", fontSize: "12px", backdropFilter: "blur(10px)" },
      };
    },
  });

  // Column data (cheap typed-array work, memoised)
  const tgtCols = useMemo(() => {
    if (!props.tgtCells || !props.tgtSim) return null;
    const vals = props.mode === "raw" ? props.tgtCells.d : props.tgtSim;
    return buildColumns(props.tgtCells, vals, props.mode === "raw" ? "raw" : "twin", 1100);
  }, [props.tgtCells, props.tgtSim, props.mode]);
  const srcCols = useMemo(() => {
    if (!props.srcCells || !props.srcSim) return null;
    const vals = props.mode === "raw" ? props.srcCells.d : props.srcSim;
    return buildColumns(props.srcCells, vals, props.mode === "raw" ? "raw" : "src", 450);
  }, [props.srcCells, props.srcSim, props.mode]);
  const colsRef = useRef({ tgtCols, srcCols });
  colsRef.current = { tgtCols, srcCols };

  // camera choreography
  const sourceKey = props.source ? `${props.source.cityId}|${props.source.lon}|${props.source.lat}` : "";
  const tgtId = props.targetCity?.id ?? "";
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const p = propsRef.current;
    const reduce = reducedMotion();
    const a = anim.current;
    if (p.targetCity && p.source) {
      if (a.lastTarget === p.targetCity.id + sourceKey) return;
      a.lastTarget = p.targetCity.id + sourceKey;
      a.arc = 0; a.reveal = 0; a.flightStart = performance.now(); a.revealStart = 0; a.flying = true;
      p.onFlightState?.(true);
      const done = () => { a.flying = false; p.onFlightState?.(false); };
      if (reduce) {
        map.jumpTo({ center: p.targetCity.center, zoom: p.targetCity.zoom + 0.3, pitch: 55, bearing: -18 });
        a.arc = 1; a.reveal = 1; done();
      } else {
        map.flyTo({ center: p.targetCity.center, zoom: p.targetCity.zoom + 0.3, pitch: 55, bearing: -18, duration: 5600, curve: 2.1, essential: true });
        map.once("moveend", done);
      }
    } else if (p.source) {
      a.lastTarget = "";
      a.arc = 0; a.reveal = 0;
      const c = p.sourceCity;
      const opts = { center: [p.source.lon, p.source.lat] as [number, number], zoom: c ? c.zoom + 1.2 : 10.5, pitch: 50, bearing: -12 };
      if (reduce) map.jumpTo(opts); else map.flyTo({ ...opts, duration: 2400, curve: 1.6, essential: true });
    }
  }, [ready, tgtId, sourceKey, mapRef]);

  // fly to selected twin
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.selectedTwin) return;
    const t = propsRef.current.twins.find((x) => x.hood.id === props.selectedTwin);
    if (!t || anim.current.flying) return;
    const o = { center: [t.hood.lon, t.hood.lat] as [number, number], zoom: 11.6, pitch: 58, bearing: -14 };
    if (reducedMotion()) map.jumpTo(o); else map.flyTo({ ...o, duration: 1600, essential: true });
  }, [ready, props.selectedTwin, mapRef]);

  // markers (HTML, crisp labels; auto-hidden behind the globe)
  const twinKey = props.twins.map((t) => t.hood.id).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const p = propsRef.current;
    if (p.source) {
      const el = document.createElement("div");
      el.className = "pointer-events-none flex flex-col items-center";
      el.innerHTML = `<div style="padding:3px 9px;border-radius:999px;background:rgba(139,92,246,.95);color:#fff;font:600 11px var(--font-geist-sans),sans-serif;box-shadow:0 0 24px rgba(139,92,246,.8);white-space:nowrap">${escapeHtml(p.source.name)}</div><div style="width:2px;height:10px;background:#a78bfa"></div><div style="width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 0 12px #a78bfa"></div>`;
      markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.source.lon, p.source.lat]).addTo(map));
    }
    p.twins.forEach((t, idx) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Twin ${idx + 1}: ${t.hood.name}`);
      el.dataset.twin = t.hood.id; el.dataset.rank = String(idx + 1);
      el.className = "twin-marker group flex cursor-pointer flex-col items-center border-0 bg-transparent p-0";
      el.innerHTML = `<div class="twin-label" style="padding:2px 8px;border-radius:999px;background:rgba(7,8,11,.82);border:1px solid rgba(255,255,255,.18);color:#fff;font:500 11px var(--font-geist-sans),sans-serif;white-space:nowrap;margin-bottom:4px;opacity:${idx === 0 ? 1 : 0.85}">${escapeHtml(t.hood.name)} <span style="font-family:var(--font-geist-mono),monospace;color:#67e8f9">${t.score.toFixed(2)}</span></div><div style="position:relative;width:26px;height:26px"><span style="position:absolute;inset:0;border-radius:50%;border:2px solid #22d3ee;animation:pulse-ring 2s ease-out infinite;animation-delay:${idx * 0.25}s"></span><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#22d3ee);color:#000;font:700 12px var(--font-geist-mono),monospace;box-shadow:0 0 18px rgba(34,211,238,.7)">${idx + 1}</span></div>`;
      el.addEventListener("click", (e) => { e.stopPropagation(); propsRef.current.onSelectTwin(t.hood.id); });
      markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([t.hood.lon, t.hood.lat]).addTo(map));
    });
    return () => { markersRef.current.forEach((m) => m.remove()); markersRef.current = []; };
  }, [ready, sourceKey, twinKey, mapRef]);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-twin]").forEach((el) => {
      const sel = el.dataset.twin === props.selectedTwin;
      el.style.zIndex = sel ? "5" : "1";
      const lab = el.querySelector<HTMLElement>(".twin-label");
      if (lab) lab.style.display = sel || el.dataset.rank === "1" ? "block" : "none";
      el.style.filter = sel ? "drop-shadow(0 0 14px rgba(167,139,250,.95))" : "none";
      el.style.transform = "";
    });
  }, [props.selectedTwin, twinKey, ready]);

  // render loop
  useEffect(() => {
    if (!ready) return;
    const overlay = overlayRef.current!;
    const reduce = reducedMotion();
    let raf = 0, lastDraw = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - lastDraw < 33) return;
      lastDraw = now;
      const a = anim.current;
      const p = propsRef.current;
      const { tgtCols, srcCols } = colsRef.current;
      // arc: draws during the first ~3.4 s of the flight
      if (p.targetCity && p.source && !reduce) {
        const e = (now - a.flightStart) / 1000;
        a.arc = Math.min(1, Math.max(0, e / 3.4));
        if (a.reveal < 1 && e > 3.6) {
          if (!a.revealStart) a.revealStart = now;
          a.reveal = Math.min(1, (now - a.revealStart) / 1400);
        }
      } else if (!p.targetCity) { a.arc = 0; a.reveal = 0; }
      const ease = (x: number) => 1 - Math.pow(1 - x, 3);
      const tt = now / 1000;
      const top = p.twins[0];
      const layers = [];
      if (srcCols) {
        layers.push(new ColumnLayer({
          id: "src-cells", data: srcCols as never, diskResolution: 6, radius: 340, extruded: true, pickable: true,
          elevationScale: 1, material: { ambient: 0.6, diffuse: 0.5, shininess: 20 }, opacity: p.targetCity ? 0.55 : 0.95,
          autoHighlight: true, highlightColor: [255, 255, 255, 90],
          updateTriggers: { getFillColor: [p.mode, srcCols.lo], getElevation: [p.mode, srcCols.lo] },
        }));
      }
      if (tgtCols) {
        layers.push(new ColumnLayer({
          id: "tgt-cells", data: tgtCols as never, diskResolution: 6, radius: 340, extruded: true, pickable: true,
          elevationScale: ease(a.reveal) , material: { ambient: 0.55, diffuse: 0.6, shininess: 40, specularColor: [200, 220, 255] }, opacity: 0.1 + 0.9 * ease(a.reveal),
          autoHighlight: true, highlightColor: [255, 255, 255, 80],
          updateTriggers: { getFillColor: [p.mode, tgtCols.lo], getElevation: [p.mode, tgtCols.lo] },
        }));
      }
      if (p.source && top && p.targetCity && a.arc > 0) {
        const from: [number, number] = [p.source.lon, p.source.lat];
        const to: [number, number] = [top.hood.lon, top.hood.lat];
        const segs = arcSegments(from, to, a.arc, 48, 255, 0.14);
        layers.push(new PathLayer<ArcSeg>({ id: "arc", data: segs, getPath: (d) => d.path, getColor: (d) => d.color, widthUnits: "pixels", getWidth: 4, capRounded: true, jointRounded: true }));
      }
      if (p.targetCity && a.reveal > 0.6) {
        layers.push(new ScatterplotLayer({
          id: "twin-rings", data: p.twins, getPosition: (d: MapTwin) => [d.hood.lon, d.hood.lat], stroked: true, filled: false,
          getLineColor: [34, 211, 238, 200], lineWidthUnits: "pixels", getLineWidth: 2, radiusUnits: "meters",
          getRadius: 650, radiusScale: 1 + 0.45 * (0.5 + 0.5 * Math.sin(tt * 2.4)),
          updateTriggers: { radiusScale: [Math.floor(tt * 30)] },
        }));
      }
      try { overlay.setProps({ layers }); } catch { /* layer error shouldn't kill the loop */ }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready, overlayRef]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} className="bg-[#07080b]" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
