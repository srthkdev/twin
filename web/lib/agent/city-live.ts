// Live city pipeline (TypeScript port of pipeline/lift.py + hoods.py on the 40-item core basket) and the city registry
// (static + live). Nominatim geocode -> Qloo heatmaps -> density correction -> Overpass neighbourhoods -> hood vectors.
import { join } from "node:path";
import coreBasketJson from "./data/core-basket.json";
import { cosine, geohash, hav, slug } from "./geo";
import { cachePath, geocode, overpass, readJson, webRoot, writeJson, type GeoHit } from "./net";
import { QlooError, qlooGet, type QlooStats } from "./qloo";
import { storeList } from "./store";
import { ToolError, r3 } from "./tool-kit";
import type { AgentCity } from "./types";

export interface CoreItem { id: string; label: string; kind: string; group: string; key: string; val: string }
export const CORE_BASKET = coreBasketJson as CoreItem[];

export type CityMeta = AgentCity;
export interface CoreCell { g: string; lon: number; lat: number; b?: number; v: number[] }
export interface CoreHood { id: string; name: string; lon: number; lat: number; v: number[]; cells?: number }
export interface CoreFile { city: string; items: string[]; cells: CoreCell[]; hoods: CoreHood[] }
interface LiveInfo extends CityMeta { qlooQuery: string; bbox: [number, number, number, number]; builtAt: string; qlooCalls: number }

export const MIN_CELLS = 150;
const MIN_COV = 0.35;
const HOOD_R_KM = 1.3;

const STATIC_QUERY: Record<string, string> = {
  "los-angeles": "Los Angeles County", "new-york": "New York City", london: "London", berlin: "Berlin", "mexico-city": "Mexico City", paris: "Paris and suburbs",
};
const STATIC_ALIASES: Record<string, string[]> = {
  "los-angeles": ["los angeles", "la", "l a"], "new-york": ["new york", "nyc", "ny", "new york city"], "mexico-city": ["mexico city", "cdmx", "ciudad de mexico"], london: [], berlin: [], paris: [],
};
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// ── registry ──
const pubDir = () => join(webRoot(), "public", "data");
const liveDir = (id?: string) => (id ? cachePath("cities", id) : cachePath("cities"));
const coreMem = new Map<string, CoreFile>();

export async function staticCities(): Promise<CityMeta[]> {
  const rows = (await readJson<Omit<CityMeta, "source" | "dims">[]>(join(pubDir(), "cities.json"))) ?? [];
  return rows.map((c) => ({ ...c, source: "static" as const, dims: 116 as const }));
}
export async function liveCities(): Promise<CityMeta[]> {
  const ids = (await storeList("cities/")).filter((k) => k.endsWith("/city.json")).map((k) => k.split("/")[1]);
  const out: CityMeta[] = [];
  for (const id of ids) {
    const i = await readJson<LiveInfo>(join(liveDir(id), "city.json"));
    if (i) out.push(publicMeta(i));
  }
  return out;
}
const publicMeta = ({ qlooQuery: _q, bbox: _b, builtAt: _t, qlooCalls: _c, ...m }: LiveInfo): CityMeta => { void _q; void _b; void _t; void _c; return m; };
export async function allCities(): Promise<CityMeta[]> { return [...(await staticCities()), ...(await liveCities())]; }

/** Match a city by id, name or alias among static + live cities. */
export async function findCityAny(text: string): Promise<CityMeta | null> {
  const q = norm(text), cs = await allCities();
  const byId = cs.find((c) => c.id === text.trim() || c.id === slug(text));
  if (byId) return byId;
  for (const c of cs) if (norm(c.name) === q || (STATIC_ALIASES[c.id] ?? []).includes(q)) return c;
  let best: { c: CityMeta; len: number } | null = null;
  for (const c of cs) for (const a of [norm(c.name), ...(STATIC_ALIASES[c.id] ?? [])]) if (a.length > 2 && (` ${q} `.includes(` ${a} `)) && (!best || a.length > best.len)) best = { c, len: a.length };
  return best?.c ?? null;
}

export async function loadCore(id: string): Promise<CoreFile | null> {
  const m = coreMem.get(id);
  if (m) return m;
  let f = await readJson<CoreFile>(join(pubDir(), "core", `${id}.json`));
  if (!f) {
    const cells = await readJson<{ items: string[]; cells: CoreCell[] }>(join(liveDir(id), "cells.json"));
    const hoods = await readJson<CoreHood[]>(join(liveDir(id), "hoods.json"));
    if (cells && hoods) f = { city: id, items: cells.items, cells: cells.cells, hoods };
  }
  if (f) coreMem.set(id, f);
  return f;
}
export async function loadCoreText(id: string): Promise<string | null> {
  try { const { readFile } = await import("node:fs/promises"); return await readFile(join(pubDir(), "core", `${id}.json`), "utf8"); } catch { /* live */ }
  const f = await loadCore(id);
  return f ? JSON.stringify(f) : null;
}
export async function qlooQueryFor(id: string): Promise<string> {
  if (STATIC_QUERY[id]) return STATIC_QUERY[id];
  const i = await readJson<LiveInfo>(join(liveDir(id), "city.json"));
  return i?.qlooQuery ?? id;
}

// ── Qloo heatmaps ──
export interface HeatCell { lat: number; lon: number; aff: number; pop: number }
interface RawHeat { results?: { heatmap?: { location: { geohash: string; latitude: number; longitude: number }; query: { affinity: number; popularity?: number } }[] } }

/** One Qloo heatmap normalised to geohash-6 (finer cells averaged up). Retries transient failures. */
export async function fetchHeat(locationQuery: string, key: string, val: string, stats?: QlooStats): Promise<Map<string, HeatCell>> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await qlooGet<RawHeat>("/v2/insights", { "filter.type": "urn:heatmap", "filter.location.query": locationQuery, [key]: val }, stats, 60000);
      const acc = new Map<string, [number, number, number, number, number]>();
      for (const x of r.results?.heatmap ?? []) {
        const g = x.location.geohash.slice(0, 6);
        const a = acc.get(g) ?? [0, 0, 0, 0, 0];
        a[0] += x.location.latitude; a[1] += x.location.longitude; a[2] += x.query.affinity; a[3] += x.query.popularity ?? 0; a[4]++;
        acc.set(g, a);
      }
      return new Map([...acc].map(([g, a]) => [g, { lat: a[0] / a[4], lon: a[1] / a[4], aff: a[2] / a[4], pop: a[3] / a[4] }]));
    } catch (e) {
      last = e;
      const m = e instanceof Error ? e.message : "";
      if (!/timeout|HTTP (429|5\d\d)|network|failed/i.test(m)) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) ** 2));
    }
  }
  throw last instanceof Error ? last : new QlooError("heatmap failed");
}

export function midranks(vals: ArrayLike<number>): Float64Array {
  const n = vals.length, order = Array.from({ length: n }, (_, i) => i).sort((a, b) => vals[a] - vals[b]), r = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && vals[order[j + 1]] === vals[order[i]]) j++;
    const mid = (i + j + 2) / 2 / n;
    for (let k = i; k <= j; k++) r[order[k]] = mid;
    i = j + 1;
  }
  return r;
}
const zscore = (L: ArrayLike<number>) => {
  const n = L.length; let mu = 0; for (let i = 0; i < n; i++) mu += L[i]; mu /= n;
  let s = 0; for (let i = 0; i < n; i++) s += (L[i] - mu) ** 2;
  const sd = Math.sqrt(s / n) || 1;
  return Float64Array.from({ length: n }, (_, i) => (L[i] - mu) / sd);
};

/**
 * Single-item correction over a city's core cells: affinity percentile (cells missing the item = city minimum) minus the
 * cell's basket baseline `b`, z-scored within the city. Returns per-core-cell demand z and how many cells had data.
 */
export function correctItem(core: CoreFile, heat: Map<string, HeatCell>): { z: Float64Array; present: number; reach: number; aff: Float64Array } {
  const n = core.cells.length;
  let mn = Infinity, present = 0;
  for (const c of core.cells) { const h = heat.get(c.g); if (h) { present++; if (h.aff < mn) mn = h.aff; } }
  if (!isFinite(mn)) mn = 0;
  const a = Float64Array.from(core.cells, (c) => heat.get(c.g)?.aff ?? mn);
  const rk = midranks(a);
  const L = Float64Array.from(core.cells, (c, k) => rk[k] - (c.b ?? 0.5));
  return { z: zscore(L), present, reach: n ? present / n : 0, aff: a };
}

export function hoodVec(cells: CoreCell[], lat: number, lon: number, r = HOOD_R_KM): { v: number[]; n: number } | null {
  const dim = cells[0]?.v.length ?? 0;
  const pick = (km: number) => cells.filter((c) => hav(lat, lon, c.lat, c.lon) <= km * 1000);
  let idx = pick(r);
  if (idx.length < 3) idx = pick(Math.max(2, r));
  if (!idx.length) return null;
  return { v: Array.from({ length: dim }, (_, i) => r3(idx.reduce((s, c) => s + c.v[i], 0) / idx.length)), n: idx.length };
}

// ── build ──
export interface BuildProgress { stage: "geocode" | "heatmaps" | "neighbourhoods" | "fingerprint"; done: number; total: number; note: string }
type ProgressFn = (p: BuildProgress) => void;
const inflight = new Map<string, { promise: Promise<CityMeta>; subs: Set<ProgressFn>; last?: BuildProgress }>();

/** Idempotent: static or cached cities return immediately; otherwise runs (and de-duplicates) the live pipeline. */
export function ensureCity(name: string, o: { stats?: QlooStats; onProgress?: ProgressFn } = {}): Promise<CityMeta> {
  const key = slug(name);
  const hit = inflight.get(key);
  if (hit) { if (o.onProgress) { hit.subs.add(o.onProgress); if (hit.last) o.onProgress(hit.last); } return hit.promise; }
  const subs = new Set<ProgressFn>(o.onProgress ? [o.onProgress] : []);
  const entry: { promise: Promise<CityMeta>; subs: Set<ProgressFn>; last?: BuildProgress } = { promise: undefined as unknown as Promise<CityMeta>, subs };
  const emit: ProgressFn = (p) => { entry.last = p; subs.forEach((f) => { try { f(p); } catch { /* subscriber gone */ } }); };
  entry.promise = buildCity(name, o.stats, emit).finally(() => inflight.delete(key));
  inflight.set(key, entry);
  return entry.promise;
}

async function buildCity(name: string, stats: QlooStats | undefined, emit: ProgressFn): Promise<CityMeta> {
  const pre = await findCityAny(name);
  if (pre && norm(pre.name) === norm(name)) return pre;
  emit({ stage: "geocode", done: 0, total: 1, note: `geocoding ${name}` });
  const hits = await geocode(name, 1);
  const g = hits[0];
  if (!g) throw new ToolError(`Could not find a place called "${name}" (Nominatim returned nothing).`);
  const id = slug(g.name);
  if (!id) throw new ToolError(`Could not derive an id for "${name}".`);
  const known = await findCityAny(id);
  if (known && known.id === id) return known;
  emit({ stage: "geocode", done: 1, total: 1, note: `${g.display}` });

  // 1. heatmaps (probe one broad item first so a bad Qloo location query fails after 1-2 calls, not 40)
  const items = CORE_BASKET;
  const heats = new Map<string, Map<string, HeatCell>>();
  let qlooQuery = g.name;
  const probe = items[0];
  let ph = await fetchHeat(qlooQuery, probe.key, probe.val, stats).catch(() => new Map<string, HeatCell>());
  if (ph.size < 30 && g.country) {
    const alt = `${g.name}, ${g.country}`;
    const ph2 = await fetchHeat(alt, probe.key, probe.val, stats).catch(() => new Map<string, HeatCell>());
    if (ph2.size > ph.size) { ph = ph2; qlooQuery = alt; }
  }
  if (ph.size < 30) throw new ToolError(`Qloo has too little data for ${g.name}: its heatmap for a top global artist covers only ${ph.size} map cells.`);
  heats.set(probe.id, ph);
  let done = 1, failed = 0;
  emit({ stage: "heatmaps", done, total: items.length, note: `${probe.label}: ${ph.size} cells` });
  const queue = items.slice(1);
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (;;) {
      const it = queue.shift();
      if (!it) return;
      const cached = await readJson<[string, number, number, number, number][]>(join(liveDir(id), "raw", `${it.id}.json`));
      let h: Map<string, HeatCell>;
      if (cached) h = new Map(cached.map(([k, lat, lon, aff, pop]) => [k, { lat, lon, aff, pop }]));
      else {
        try {
          h = await fetchHeat(qlooQuery, it.key, it.val, stats);
          await writeJson(join(liveDir(id), "raw", `${it.id}.json`), [...h].map(([k, c]) => [k, c.lat, c.lon, c.aff, c.pop]));
        } catch { failed++; h = new Map(); }
      }
      heats.set(it.id, h);
      done++;
      emit({ stage: "heatmaps", done, total: items.length, note: `${it.label}: ${h.size} cells` });
    }
  }));
  await writeJson(join(liveDir(id), "raw", `${probe.id}.json`), [...ph].map(([k, c]) => [k, c.lat, c.lon, c.aff, c.pop]));
  if (failed > 10) throw new ToolError(`Qloo heatmap requests kept failing for ${g.name} (${failed} of ${items.length}). Try again later.`);

  // 2. correction (same as pipeline/lift.py)
  emit({ stage: "fingerprint", done: 0, total: 1, note: "density correction" });
  const itemsWithData = items.filter((it) => (heats.get(it.id)?.size ?? 0) > 0);
  const cov = new Map<string, number>(), pos = new Map<string, [number, number]>();
  for (const it of items) for (const [k, c] of heats.get(it.id) ?? []) { cov.set(k, (cov.get(k) ?? 0) + 1); if (!pos.has(k)) pos.set(k, [c.lat, c.lon]); }
  const need = MIN_COV * items.length;
  const gs = [...cov].filter(([, c]) => c >= need).map(([k]) => k).sort();
  if (gs.length < MIN_CELLS) throw new ToolError(`Qloo has too little data for ${g.name}: only ${gs.length} map cells have data for at least ${Math.ceil(need)} of ${items.length} core signals (need ${MIN_CELLS}).`);
  const n = gs.length, m = items.length;
  const ranks: Float64Array[] = [];
  for (const it of items) {
    const h = heats.get(it.id)!;
    let mn = Infinity; for (const k of gs) { const c = h.get(k); if (c && c.aff < mn) mn = c.aff; }
    if (!isFinite(mn)) mn = 0;
    ranks.push(midranks(Float64Array.from(gs, (k) => h.get(k)?.aff ?? mn)));
  }
  const base = Float64Array.from({ length: n }, (_, k) => ranks.reduce((s, r) => s + r[k], 0) / m);
  const Z = ranks.map((r) => zscore(Float64Array.from(r, (x, k) => x - base[k])));
  const cells: CoreCell[] = gs.map((k, ci) => ({ g: k, lon: Math.round(pos.get(k)![1] * 1e4) / 1e4, lat: Math.round(pos.get(k)![0] * 1e4) / 1e4, b: r3(base[ci]), v: Z.map((z) => r3(z[ci])) }));
  const sparseItems = items.filter((it) => (heats.get(it.id)?.size ?? 0) < 100).length;
  emit({ stage: "fingerprint", done: 1, total: 1, note: `${n} cells, ${itemsWithData.length}/${m} signals with data` });

  // 3. neighbourhoods
  emit({ stage: "neighbourhoods", done: 0, total: 1, note: "OpenStreetMap neighbourhoods" });
  const { hoods, source: hoodSource } = await findHoods(id, g, qlooQuery, cells, stats);
  emit({ stage: "neighbourhoods", done: 1, total: 1, note: `${hoods.length} neighbourhoods (${hoodSource})` });

  const lats = cells.map((c) => c.lat).sort((a, b) => a - b), lons = cells.map((c) => c.lon).sort((a, b) => a - b);
  const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const span = Math.max(q(lons, 0.95) - q(lons, 0.05), (q(lats, 0.95) - q(lats, 0.05)) * 1.4, 0.02);
  const zoom = Math.round(Math.min(12, Math.max(8, Math.log2(360 / span) + 1)) * 10) / 10;
  const info: LiveInfo = {
    id, name: g.name, country: g.country, center: [g.lon, g.lat], zoom, cellCount: n, hoodCount: hoods.length, source: "live", dims: 40,
    coverage: { cells: n, sparseItems, itemsWithData: itemsWithData.length, failedItems: failed, hoodSource },
    qlooQuery, bbox: g.bbox, builtAt: new Date().toISOString(), qlooCalls: stats?.live ?? 0,
  };
  await writeJson(join(liveDir(id), "cells.json"), { city: id, items: items.map((i) => i.id), cells });
  await writeJson(join(liveDir(id), "hoods.json"), hoods);
  await writeJson(join(liveDir(id), "city.json"), info);
  coreMem.delete(id);
  return publicMeta(info);
}

const PLACE_RANK: Record<string, number> = { suburb: 3, quarter: 2, neighbourhood: 1 };

async function findHoods(cityId: string, g: GeoHit, qlooQuery: string, cells: CoreCell[], stats?: QlooStats): Promise<{ hoods: CoreHood[]; source: string }> {
  const lat = cells.map((c) => c.lat), lon = cells.map((c) => c.lon), pad = 0.01;
  const s = Math.max(Math.min(...lat) - pad, g.bbox[0] - 0.05), n = Math.min(Math.max(...lat) + pad, g.bbox[2] + 0.05);
  const w = Math.max(Math.min(...lon) - pad, g.bbox[1] - 0.05), e = Math.min(Math.max(...lon) + pad, g.bbox[3] + 0.05);
  type Cand = { name: string; lat: number; lon: number; score: number };
  const cands: Cand[] = [];
  let source = "openstreetmap";
  try {
    const els = await overpass(`[out:json][timeout:35];node["place"~"^(suburb|quarter|neighbourhood)$"]["name"](${s},${w},${n},${e});out body;`, { timeoutMs: 25000 });
    for (const el of els) {
      const t = el.tags ?? {}, nm = t["name:en"] || t.int_name || t.name;
      if (!nm || el.lat == null || el.lon == null) continue;
      const pop = parseInt((t.population ?? "").replace(/\D/g, ""), 10);
      cands.push({ name: nm, lat: el.lat, lon: el.lon, score: (PLACE_RANK[t.place] ?? 0) + (pop ? Math.log10(pop) : 0) + (t.wikidata || t.wikipedia ? 1.5 : 0) });
    }
  } catch { source = "qloo-localities"; }
  if (cands.length < 5) {
    source = cands.length ? "openstreetmap+qloo-localities" : "qloo-localities";
    try {
      const r = await qlooGet<{ results?: { entities?: { name: string; popularity?: number; location?: { lat: number; lon: number }; properties?: { admin_level?: number } }[] } }>(
        "/v2/insights", { "filter.type": "urn:entity:locality", "filter.location.query": qlooQuery, "filter.parents.types": "urn:entity:locality", take: 50 }, stats, 30000);
      for (const e2 of r.results?.entities ?? []) if (e2.location && (e2.properties?.admin_level ?? 9) >= 8) cands.push({ name: e2.name, lat: e2.location.lat, lon: e2.location.lon, score: 2 + (e2.popularity ?? 0) * 3 });
    } catch { /* no fallback available */ }
  }
  cands.sort((a, b) => b.score - a.score);
  const hoods: CoreHood[] = [], seen = new Set<string>();
  for (const c of cands) {
    if (hoods.length >= 30) break;
    const key = norm(c.name);
    if (!key || seen.has(key)) continue;
    if (hoods.some((h) => hav(h.lat, h.lon, c.lat, c.lon) < 600)) continue;
    const hv = hoodVec(cells, c.lat, c.lon);
    if (!hv || hv.n < 2) continue;
    seen.add(key);
    hoods.push({ id: `${cityId}-${slug(c.name)}`, name: c.name, lon: Math.round(c.lon * 1e4) / 1e4, lat: Math.round(c.lat * 1e4) / 1e4, v: hv.v, cells: hv.n });
  }
  return { hoods, source };
}

export { cosine, geohash };
