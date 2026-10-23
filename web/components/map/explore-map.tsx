"use client";
import { useEffect, useMemo, useRef } from "react";
import useSWRImmutable from "swr/immutable";
import { fetchJson } from "@/hooks/use-json";
import maplibregl from "maplibre-gl";
import { ColumnLayer, PathLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { arcSegments, useDeckMap, type ArcSeg } from "./use-deck-map";
import { colorAt, type PaletteName } from "@/lib/colors";
import { normalizeRobust } from "@/lib/similarity";
import type { City, Hood, OpportunityResult, PackedCells } from "@/lib/types";

type Supply = { kinds: string[]; cells: Record<string, number[]> };
export interface MapPin { n: number; label: string; lat: number; lon: number; city?: string }
export interface MapTwin { hood: Hood; score: number }
export interface SourcePoint { lon: number; lat: number; name: string; cityId: string }
export type Mode = "twin" | "raw" | "opportunity";

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
  opportunity: OpportunityResult | null;
  opportunityCity: City | null;
  onPickSourceCell: (i: number) => void;
  onSelectTwin: (id: string) => void;
  onFlightState?: (flying: boolean) => void;
  /** Basket group per fingerprint dimension (aligned with basketLabels), for the three-colour mix. */
  basketGroups: string[];
  /** Neighbourhoods, to name the block under the cursor. */
  hoods: Hood[];
  sourceName: string;
  /** Click on a block (either city): screen position + what's there. */
  onBlockClick?: (b: BlockInfo) => void;
  /** Hide the hover card (e.g. while the ask box is open). */
  quiet?: boolean;
  /** One-off camera target from the agent (a clicked place in an answer). `t` changes on every request. */
  focus?: { lat: number; lon: number; label?: string; t: number } | null;
  /** an open report's places, numbered in its order */
  pins?: MapPin[];
}

export interface BlockInfo { x: number; y: number; lat: number; lon: number; g: string; city: string; near: string; isSource: boolean; index: number; match: number | null }

// ── three-colour blocks: height = similarity, segments = what the block's distinctive taste is made of ──
import { MIX, mixOf } from "./mix";

/** Share of a cell's positive (distinctive) taste in each of the three groups, averaged per dimension so big groups don't dominate. */
function cellMix(cells: PackedCells, i: number, groups: string[], counts: number[]): [number, number, number] {
  const s = [0, 0, 0], off = i * cells.dim;
  for (let k = 0; k < cells.dim; k++) { const z = cells.v[off + k]; if (z > 0) s[mixOf(groups[k] ?? "")] += z; }
  const m = s.map((x, j) => x / (counts[j] || 1));
  const tot = m[0] + m[1] + m[2];
  return tot > 0 ? [m[0] / tot, m[1] / tot, m[2] / tot] : [1 / 3, 1 / 3, 1 / 3];
}

/** One block per cell: height = similarity to the source, colour = the cell's dominant taste (sound / table / scene). */
interface StackData { cols: ColumnData; mix: Float32Array; t: Float32Array; lo: number }
function buildStacks(cells: PackedCells, vals: Float32Array, maxElev: number, groups: string[]): StackData {
  const { t, lo } = normalizeRobust(vals);
  const n = cells.n, counts = [0, 0, 0];
  for (let k = 0; k < cells.dim; k++) counts[mixOf(groups[k] ?? "")]++;
  const mix = new Float32Array(n * 3), pos = new Float64Array(n * 2), elev = new Float32Array(n), fill = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 2] = cells.lon[i]; pos[i * 2 + 1] = cells.lat[i];
    const m = cellMix(cells, i, groups, counts);
    mix.set(m, i * 3);
    const dom = m[0] >= m[1] && m[0] >= m[2] ? 0 : m[1] >= m[2] ? 1 : 2;
    const [r, g, b] = MIX[dom].rgb, shade = 0.3 + 0.7 * t[i];
    fill.set([r * shade, g * shade, b * shade, Math.round(90 + 165 * Math.min(1, t[i] * 1.2))], i * 4);
    elev[i] = 25 + Math.pow(t[i], 2.2) * maxElev;
  }
  return { cols: { length: n, attributes: { getPosition: { value: pos, size: 2 }, getElevation: { value: elev, size: 1 }, getFillColor: { value: fill, size: 4 } }, t }, mix, t, lo };
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

function buildOppColumns(res: OpportunityResult, maxElev: number): ColumnData {
  const n = res.cells.length;
  const max = Math.max(1e-6, ...res.cells.map((c) => c.score));
  const pos = new Float64Array(n * 2), elev = new Float32Array(n), fill = new Uint8ClampedArray(n * 4), t = new Float32Array(n);
  res.cells.forEach((c, i) => {
    t[i] = Math.min(1, Math.max(0, c.score / max));
    pos[i * 2] = c.lon; pos[i * 2 + 1] = c.lat;
    fill.set(colorAt("opp", t[i]), i * 4);
    elev[i] = 25 + t[i] * maxElev;
  });
  return { length: n, attributes: { getPosition: { value: pos, size: 2 }, getElevation: { value: elev, size: 1 }, getFillColor: { value: fill, size: 4 } }, t };
}

function nearestHood(hoods: Hood[], lat: number, lon: number): string | null {
  let best: string | null = null, bd = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const h of hoods) { const d = (h.lat - lat) ** 2 + ((h.lon - lon) * k) ** 2; if (d < bd) { bd = d; best = h.name; } }
  return bd < 0.0004 ? best : null; // within ~2 km
}
/** Similarity as words people use: "78% like silver lake", or "not much like silver lake" for weak/negative matches. */
function likeness(m: number | null, name: string) {
  const n = escapeHtml(name.toLowerCase());
  if (m == null) return n;
  return m >= 0.15 ? `<span style="color:#f0a03c">${Math.round(m * 100)}% match</span> with ${n}` : `<span style="color:#8d8a80">weak match with ${n}</span>`;
}
const card = (title: string, body: string, foot: string) =>
  `<div style="padding:7px 9px 8px"><div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#5f5c55">${title}</div>${body}</div><div style="border-top:1px solid #22211d;padding:5px 9px;color:#f0a03c;font-size:10.5px">${foot}</div>`;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Separate ground-level faces from MapLibre's globe depth without changing the bars' geometry.
const columnParameters = { depthCompare: "less-equal" as const, depthWriteEnabled: true, depthBias: -1, depthBiasSlopeScale: -1 };
const columnMaterial = { ambient: 0.6, diffuse: 0.55, shininess: 24, specularColor: [255, 230, 200] as [number, number, number] };

export default function ExploreMap(props: ExploreMapProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const anim = useRef({ arc: 0, reveal: 0, flightStart: 0, flying: false, lastTarget: "" as string, revealStart: 0 });

  const { containerRef, mapRef, overlayRef, ready } = useDeckMap({
    center: [-118.3, 34.05], zoom: 9, pitch: 45, bearing: -10,
    onClick: (info: PickingInfo) => {
      const b = blockAt(info);
      if (!b) return;
      const p = propsRef.current;
      if (p.onBlockClick) p.onBlockClick(b);
      else if (b.isSource) p.onPickSourceCell(b.index);
    },
    getTooltip: (info: PickingInfo) => {
      const p = propsRef.current;
      if (info.index < 0 || !info.layer || p.quiet) return null;
      const style = { zIndex: "60", background: "#11110f", border: "1px solid #383631", borderRadius: "0", padding: "0", color: "#e6e3da", fontSize: "11.5px", fontFamily: "var(--font-geist-mono), monospace", maxWidth: "260px" };
      if (info.layer.id === "opp-cells") {
        const c = p.opportunity?.cells[info.index];
        if (!c) return null;
        const near = nearestHood(p.hoods, c.lat, c.lon);
        return { html: card(near ? escapeHtml(near) : "this block", `<div style="font-size:15px;margin:2px 0 6px">${c.supply === 0 ? "no" : c.supply} existing places · ${c.demand >= 2 ? "very strong" : c.demand >= 1 ? "strong" : c.demand > 0 ? "above average" : "low"} demand</div><div style="color:#8d8a80">opportunity compares demand with existing places</div>`, "click to ask about this spot"), style };
      }
      const b = blockAt(info);
      if (!b) return null;
      const cells = b.isSource ? p.srcCells : p.tgtCells;
      if (!cells) return null;
      const i = b.index;
      const stack = b.isSource ? colsRef.current.srcStack : colsRef.current.tgtStack;
      const head = p.mode === "raw"
        ? `<div style="font-size:15px;margin:2px 0 6px">popularity ${Math.round(cells.d[i] * 100)}%</div><div style="color:#8d8a80;margin-bottom:6px">how busy this block is in Qloo's data</div>`
        : `<div style="font-size:15px;margin:2px 0 6px">${likeness(b.match, p.sourceName)}</div>`;
      const mix = stack ? MIX.map((m, j) => {
        const v = stack.mix[i * 3 + j];
        return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:38px;color:#8d8a80">${m.name}</span><span style="flex:1;height:5px;background:#22211d;position:relative"><span style="position:absolute;inset:0 auto 0 0;width:${Math.round(v * 100)}%;background:rgb(${m.rgb.join(",")})"></span></span><span style="width:28px;text-align:right;color:#8d8a80">${Math.round(v * 100)}%</span></div>`;
      }).join("") : "";
      const traits = cells.top[i].slice(0, 3).map((k) => escapeHtml(p.basketLabels[k] ?? "")).filter(Boolean).join(" · ");
      const sup = supplyRef.current[cells.city];
      const counts = sup?.cells[cells.g[i]];
      const SHOW: [string, string][] = [["cafe", "cafés"], ["bar", "bars"], ["restaurant", "restaurants"], ["art_gallery", "galleries"], ["music_venue", "venues"], ["record_store", "record shops"]];
      const supply = counts ? SHOW.map(([k, l]) => { const n = counts[sup!.kinds.indexOf(k)] ?? 0; return n ? `${n} ${l}` : ""; }).filter(Boolean).slice(0, 4).join(" · ") : "";
      const body = `${head}${mix ? `<div style="margin-bottom:6px">${mix}</div>` : ""}${traits ? `<div style="color:#e6e3da;margin-bottom:4px">${traits}</div>` : ""}${supply ? `<div style="color:#8d8a80">${supply}</div>` : ""}`;
      return { html: card(b.near ? escapeHtml(b.near) : "this block", body, b.isSource ? "click: use as source or ask" : "click to ask about this block"), style };
    },
  });

  /** Which block a pick hit, in either city and either rendering (columns or stacked cubes). */
  function blockAt(info: PickingInfo): BlockInfo | null {
    const id = info.layer?.id ?? "";
    if (info.index < 0 || !/^(src|tgt)-(cells|stack)$/.test(id)) return null;
    const p = propsRef.current, isSource = id.startsWith("src");
    const cells = isSource ? p.srcCells : p.tgtCells, sim = isSource ? p.srcSim : p.tgtSim;
    if (!cells) return null;
    const i = info.index;
    const lat = cells.lat[i], lon = cells.lon[i];
    return { x: info.x, y: info.y, lat, lon, g: cells.g[i], city: cells.city, near: nearestHood(p.hoods, lat, lon) ?? "", isSource, index: i, match: sim ? sim[i] : null };
  }

  // Column data (cheap typed-array work, memoised)
  const tgtCols = useMemo(() => {
    if (!props.tgtCells || !props.tgtSim) return null;
    const vals = props.mode === "raw" ? props.tgtCells.d : props.tgtSim;
    return buildColumns(props.tgtCells, vals, props.mode === "raw" ? "raw" : "twin", 1100);
  }, [props.tgtCells, props.tgtSim, props.mode]);
  const srcCols = useMemo(() => {
    if (!props.srcCells || !props.srcSim) return null;
    const vals = props.mode === "raw" ? props.srcCells.d : props.srcSim;
    return buildColumns(props.srcCells, vals, props.mode === "raw" ? "raw" : "twin", 650);
  }, [props.srcCells, props.srcSim, props.mode]);
  const oppCols = useMemo(() => (props.opportunity?.cells.length ? buildOppColumns(props.opportunity, 1500) : null), [props.opportunity]);
  const groupsKey = props.basketGroups.join("|");
  const tgtStack = useMemo(() => (props.tgtCells && props.tgtSim && props.mode === "twin" ? buildStacks(props.tgtCells, props.tgtSim, 1100, props.basketGroups) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.tgtCells, props.tgtSim, props.mode, groupsKey]);
  const srcStack = useMemo(() => (props.srcCells && props.srcSim && props.mode === "twin" ? buildStacks(props.srcCells, props.srcSim, 650, props.basketGroups) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.srcCells, props.srcSim, props.mode, groupsKey]);
  const colsRef = useRef({ tgtCols, srcCols, oppCols, tgtStack, srcStack });
  colsRef.current = { tgtCols, srcCols, oppCols, tgtStack, srcStack };

  // Overture venue counts per cell for the hover card (≈150–300 KB per city, loaded once)
  const { data: srcSupply } = useSWRImmutable<Supply>(props.sourceCity ? `/data/supply/${props.sourceCity.id}.json` : null, fetchJson, { shouldRetryOnError: false });
  const { data: tgtSupply } = useSWRImmutable<Supply>(props.targetCity ? `/data/supply/${props.targetCity.id}.json` : null, fetchJson, { shouldRetryOnError: false });
  const supplyRef = useRef<Record<string, Supply | undefined>>({});
  supplyRef.current = { [props.sourceCity?.id ?? ""]: srcSupply, [props.targetCity?.id ?? ""]: tgtSupply };

  // opportunity result: fly to its city
  const oppKey = props.opportunity && props.opportunityCity ? `${props.opportunityCity.id}|${props.opportunity.cells.length}|${props.opportunity.cells[0]?.g}` : "";
  useEffect(() => {
    const map = mapRef.current;
    const c = propsRef.current.opportunityCity;
    if (!ready || !map || !oppKey || !c) return;
    const o = { center: c.center, zoom: c.zoom + 0.5, pitch: 55, bearing: -18 };
    if (reducedMotion()) map.jumpTo(o); else map.flyTo({ ...o, duration: 3200, essential: true });
  }, [ready, oppKey, mapRef]);

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
      kick.current();
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

  // fly to a spot the agent linked; drop a small label there
  const focusMarker = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current, f = props.focus;
    if (!ready || !map || !f) return;
    const o = { center: [f.lon, f.lat] as [number, number], zoom: 13, pitch: 55, bearing: -14 };
    if (reducedMotion()) map.jumpTo(o); else map.flyTo({ ...o, duration: 1800, essential: true });
    focusMarker.current?.remove();
    const el = document.createElement("div");
    el.className = "pointer-events-none flex flex-col items-center";
    el.innerHTML = `<div style="padding:2px 6px;background:#f0a03c;color:#0b0b0a;font:600 11px var(--font-geist-mono),monospace;white-space:nowrap">${escapeHtml((f.label ?? "here").toLowerCase())}</div><div style="width:1px;height:14px;background:#f0a03c"></div><div style="width:7px;height:7px;background:#f0a03c"></div>`;
    focusMarker.current = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([f.lon, f.lat]).addTo(map);
  }, [ready, props.focus, mapRef]);

  // numbered pins for the open report; the view frames them when they sit in one city
  const pinMarkers = useRef<maplibregl.Marker[]>([]);
  const pinKey = (props.pins ?? []).map((p) => `${p.n}:${p.lat},${p.lon}`).join("|");
  useEffect(() => {
    const map = mapRef.current, pins = props.pins ?? [];
    if (!ready || !map) return;
    pinMarkers.current.forEach((m) => m.remove());
    pinMarkers.current = pins.map((p) => {
      const el = document.createElement("div");
      el.className = "pointer-events-none flex items-center gap-1";
      el.innerHTML = `<div style="width:18px;height:18px;display:grid;place-items:center;background:${p.n === 1 ? "#f0a03c" : "#0b0b0a"};color:${p.n === 1 ? "#0b0b0a" : "#f0a03c"};border:1px solid #f0a03c;font:600 10px var(--font-geist-mono),monospace">${p.n}</div>${p.n <= 3 ? `<div style="padding:1px 4px;background:rgba(11,11,10,.82);color:#e8e6df;font:500 10px var(--font-geist-mono),monospace;white-space:nowrap">${escapeHtml(p.label.toLowerCase())}</div>` : ""}`;
      return new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([p.lon, p.lat]).addTo(map);
    });
    const frame = () => {
      if (pins.length < 2) return;
      const lats = pins.map((p) => p.lat), lons = pins.map((p) => p.lon);
      const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
      if (n - s < 1 && e - w < 1.5) map.fitBounds([[w, s], [e, n]], { padding: 90, maxZoom: 13, pitch: 45, duration: reducedMotion() ? 0 : 1600 });
    };
    // a flight to the report's city may still be running: frame the pins once it lands
    if (anim.current.flying) map.once("moveend", frame); else frame();
    return () => { map.off("moveend", frame); pinMarkers.current.forEach((m) => m.remove()); pinMarkers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinKey stands for pins
  }, [ready, pinKey, mapRef]);

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
      el.innerHTML = `<div style="padding:2px 6px;background:#e6e3da;color:#0b0b0a;font:600 11px var(--font-geist-mono),monospace;white-space:nowrap">${escapeHtml(p.source.name.toLowerCase())}</div><div style="width:1px;height:12px;background:#e6e3da"></div><div style="width:7px;height:7px;background:#e6e3da"></div>`;
      markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.source.lon, p.source.lat]).addTo(map));
    }
    p.twins.forEach((t, idx) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Twin ${idx + 1}: ${t.hood.name}`);
      el.dataset.twin = t.hood.id; el.dataset.rank = String(idx + 1);
      el.className = "twin-marker group flex cursor-pointer flex-col items-center border-0 bg-transparent p-0";
      el.innerHTML = `<div class="twin-label" style="padding:2px 6px;background:#0b0b0a;border:1px solid #383631;color:#e6e3da;font:500 11px var(--font-geist-mono),monospace;white-space:nowrap;margin-bottom:3px">${escapeHtml(t.hood.name.toLowerCase())} <span style="color:#f0a03c">${Math.round(t.score * 100)}% match</span></div><div style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;font:600 11px var(--font-geist-mono),monospace;${idx === 0 ? "background:#f0a03c;color:#0b0b0a" : "background:#0b0b0a;color:#f0a03c;border:1px solid #f0a03c"}">${idx + 1}</div>`;
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
      el.style.filter = "none"; el.style.outline = sel ? "1px solid #e6e3da" : "none"; el.style.outlineOffset = "3px";
      el.style.transform = "";
    });
  }, [props.selectedTwin, twinKey, ready]);

  // Layers are rebuilt only when inputs change, plus a short animation burst during a flight (arc grows, blocks rise).
  // Between those, deck.gl has nothing to redraw — the map stays idle unless the camera moves.
  const draw = useRef<(now: number) => boolean>(() => false);
  draw.current = (now: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return false;
    const a = anim.current, p = propsRef.current, reduce = reducedMotion();
    const { tgtCols, srcCols, oppCols, tgtStack, srcStack } = colsRef.current;
    let animating = false;
    if (p.targetCity && p.source && !reduce && a.flightStart) {
      const e = (now - a.flightStart) / 1000;
      a.arc = Math.min(1, Math.max(0, e / 3.4));
      if (e > 3.6) { if (!a.revealStart) a.revealStart = now; a.reveal = Math.min(1, (now - a.revealStart) / 1400); }
      animating = a.arc < 1 || a.reveal < 1;
    } else if (!p.targetCity) { a.arc = 0; a.reveal = 0; } else if (reduce) { a.arc = 1; a.reveal = 1; }
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const top = p.twins[0];
    // only the city in view: the target once one is chosen, otherwise the source
    const showSrc = !p.targetCity || a.reveal < 1;
    const layers = [];
    if (p.mode === "opportunity" && oppCols) {
      layers.push(new ColumnLayer({
        id: "opp-cells", data: oppCols as never, diskResolution: 4, angle: 45, radius: 330, extruded: true, pickable: true,
        material: columnMaterial, parameters: columnParameters, opacity: 0.95, autoHighlight: true, highlightColor: [230, 227, 218, 110],
      }));
    }
    const pushStack = (id: string, st: StackData, opacity: number, rise = 1) => layers.push(new ColumnLayer({
      id, data: st.cols as never, diskResolution: 4, angle: 45, radius: 320, extruded: true, pickable: true,
      elevationScale: rise, material: columnMaterial, parameters: columnParameters, opacity, autoHighlight: true, highlightColor: [230, 227, 218, 120],
    }));
    if (p.mode === "twin") {
      if (srcStack && showSrc) pushStack("src-stack", srcStack, p.targetCity ? 0.55 : 0.95);
      if (tgtStack && p.targetCity) pushStack("tgt-stack", tgtStack, 0.08 + 0.92 * ease(a.reveal), 0.05 + 0.95 * ease(a.reveal));
    }
    if (p.mode === "raw") {
      if (srcCols && showSrc) layers.push(new ColumnLayer({
        id: "src-cells", data: srcCols as never, diskResolution: 4, angle: 45, radius: 330, extruded: true, pickable: true,
        material: columnMaterial, parameters: columnParameters, opacity: p.targetCity ? 0.6 : 0.95, autoHighlight: true, highlightColor: [230, 227, 218, 110],
      }));
      if (tgtCols && p.targetCity) layers.push(new ColumnLayer({
        id: "tgt-cells", data: tgtCols as never, diskResolution: 4, angle: 45, radius: 330, extruded: true, pickable: true,
        elevationScale: ease(a.reveal), material: columnMaterial, parameters: columnParameters, opacity: 0.1 + 0.9 * ease(a.reveal), autoHighlight: true, highlightColor: [230, 227, 218, 110],
      }));
    }
    if (p.source && top && p.targetCity && a.arc > 0 && p.mode !== "opportunity") {
      const segs = arcSegments([p.source.lon, p.source.lat], [top.hood.lon, top.hood.lat], a.arc, 48, 255, 0.14);
      layers.push(new PathLayer<ArcSeg>({ id: "arc", data: segs, getPath: (d) => d.path, getColor: (d) => d.color, widthUnits: "pixels", getWidth: 2.5, capRounded: true, jointRounded: true }));
    }
    try { overlay.setProps({ layers }); } catch { /* a bad layer shouldn't break the map */ }
    return animating;
  };
  const rafRef = useRef(0);
  const kick = useRef(() => {});
  kick.current = () => {
    cancelAnimationFrame(rafRef.current);
    const loop = (now: number) => { if (draw.current(now)) rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  const arcTarget = props.twins[0]?.hood;
  const arcKey = arcTarget ? `${arcTarget.lon}|${arcTarget.lat}` : "";
  useEffect(() => {
    if (ready) kick.current();
  }, [ready, tgtCols, srcCols, oppCols, tgtStack, srcStack, props.mode, tgtId, sourceKey, arcKey]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} className="bg-background" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
