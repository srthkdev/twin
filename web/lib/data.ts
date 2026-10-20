import { CITY_CODES } from "./groups";
import type { BasketItem, CellsFile, City, CoreFile, DataSet, Evals, Hood, Meta, PackedCells, TwinsFile } from "./types";

/** Real data lives in /data; if its meta.json is missing we fall back to /data-mock. */
let basePromise: Promise<string> | null = null;
export function getBase(): Promise<string> {
  if (!basePromise) {
    basePromise = (async () => {
      try {
        const r = await fetch("/data/meta.json", { cache: "no-cache" });
        if (r.ok) {
          const j = await r.json();
          if (j && Array.isArray(j.cities)) return "/data";
        }
      } catch {
        /* fall through */
      }
      return "/data-mock";
    })();
  }
  return basePromise;
}

const cache = new Map<string, Promise<unknown>>();
async function load<T>(file: string): Promise<T> {
  const base = await getBase();
  const key = `${base}/${file}`;
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetch(key).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${key}: ${r.status}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export const loadMeta = () => load<Meta>("meta.json");
export const loadBasket = () => load<BasketItem[]>("basket.json");
const loadStaticCities = () => load<City[]>("cities.json");

/** Cities = GET /api/cities (static + live); falls back to the static list if the route is missing. */
export async function loadCities(): Promise<City[]> {
  try {
    const r = await fetch("/api/cities", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { cities?: City[] };
      if (Array.isArray(j.cities) && j.cities.length) return j.cities;
    }
  } catch { /* fall through */ }
  return loadStaticCities();
}
export const isLive = (c?: City | null) => c?.source === "live";
/** Short code for the city row: known codes for the six static cities, first letters for the rest. */
export const cityCode = (c: Pick<City, "id" | "name">) => CITY_CODES[c.id] ?? c.name.replace(/[^\p{L}]/gu, "").slice(0, 3).toUpperCase();
export const loadHoods = () => load<Hood[]>("hoods.json");
export const loadTwins = () => load<TwinsFile>("twins.json");
export const loadEvals = () => load<Evals>("evals.json");

const coreCache = new Map<string, Promise<CoreFile>>();
/** Core-basket (40 dim) file for any city. */
export function loadCore(cityId: string): Promise<CoreFile> {
  let p = coreCache.get(cityId);
  if (!p) {
    p = (async () => {
      const r = await fetch(`/api/cities/${encodeURIComponent(cityId)}/core`);
      if (r.ok) return (await r.json()) as CoreFile;
      const s = await fetch(`/data/core/${encodeURIComponent(cityId)}.json`);
      if (!s.ok) throw new Error(`No core data for ${cityId}`);
      return (await s.json()) as CoreFile;
    })();
    p.catch(() => coreCache.delete(cityId));
    coreCache.set(cityId, p);
  }
  return p;
}

const topDims = (v: number[], n = 7) => v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);

export function coreHoods(core: CoreFile, cityId: string): Hood[] {
  return core.hoods.map((h) => ({ id: h.id, city: cityId, name: h.name, lon: h.lon, lat: h.lat, cells: 0, v: h.v, top: topDims(h.v) }));
}

/** Labels for core dims: ids from the core file, kind/group/label from the full basket. */
export function coreBasketOf(items: string[], basket: BasketItem[]): BasketItem[] {
  const byId = new Map(basket.map((b) => [b.id, b]));
  return items.map((id, i) => {
    const b = byId.get(id);
    return { i, id, label: b?.label ?? id, kind: b?.kind ?? "place-tag", group: b?.group ?? "lifestyle" };
  });
}

export async function loadDataSet(): Promise<DataSet> {
  const [basket, cities, hoods, twins] = await Promise.all([loadBasket(), loadCities(), loadHoods(), loadTwins()]);
  // Live cities have no 116-dim data: their hoods come from the core files.
  const live = cities.filter(isLive);
  const cores = await Promise.all(live.map((c) => loadCore(c.id).then((f) => [c, f] as const).catch(() => null)));
  const liveHoods = cores.flatMap((x) => (x ? coreHoods(x[1], x[0].id) : []));
  const items = cores.find(Boolean)?.[1].items ?? (await loadCore(cities.find((c) => !isLive(c))?.id ?? "los-angeles").then((f) => f.items).catch(() => [] as string[]));
  return { basket, cities, hoods: [...hoods, ...liveHoods], twins, coreBasket: coreBasketOf(items, basket) };
}

/** POST /api/cities {name}: streams SSE progress, resolves with the finished city. */
export async function addCity(name: string, onProgress: (p: { stage: string; done: number; total: number; note?: string }) => void): Promise<City> {
  const res = await fetch("/api/cities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", city: City | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      if (!chunk.startsWith("data: ")) continue;
      let e: { type: string; stage?: string; done?: number; total?: number; note?: string; city?: City; message?: string };
      try { e = JSON.parse(chunk.slice(6)); } catch { continue; }
      if (e.type === "progress") onProgress({ stage: e.stage ?? "", done: e.done ?? 0, total: e.total ?? 0, note: e.note });
      else if (e.type === "error") throw new Error(e.message ?? "Could not add city");
      else if (e.type === "done" && e.city) city = e.city;
    }
  }
  if (!city) throw new Error("City pipeline ended without a result");
  return city;
}

const packedCache = new Map<string, Promise<PackedCells>>();
/** Loads cells for a city and packs them into typed arrays (cached). */
export function loadCells(cityId: string, core = false): Promise<PackedCells> {
  const key = core ? `core:${cityId}` : cityId;
  let p = packedCache.get(key);
  if (!p) {
    p = core
      ? loadCore(cityId).then(packCore.bind(null, cityId))
      : load<CellsFile>(`cells/${cityId}.json`).then(pack);
    p.catch(() => packedCache.delete(key));
    packedCache.set(key, p);
  }
  return p;
}

/** Core cells carry no raw density or precomputed top dims: derive both from the vector. */
function packCore(cityId: string, f: CoreFile): PackedCells {
  return pack({
    city: cityId,
    cells: f.cells.map((c) => ({ g: c.g, lon: c.lon, lat: c.lat, d: Math.hypot(...c.v), v: c.v, top: topDims(c.v, 3) })),
  });
}

function pack(f: CellsFile): PackedCells {
  const n = f.cells.length;
  const dim = n ? f.cells[0].v.length : 0;
  const lon = new Float32Array(n), lat = new Float32Array(n), d = new Float32Array(n), norm = new Float32Array(n);
  const v = new Float32Array(n * dim);
  const g: string[] = new Array(n);
  const top: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = f.cells[i];
    lon[i] = c.lon; lat[i] = c.lat; d[i] = c.d; g[i] = c.g; top[i] = c.top;
    let s = 0;
    for (let k = 0; k < dim; k++) { const x = c.v[k]; v[i * dim + k] = x; s += x * x; }
    norm[i] = Math.sqrt(s) || 1;
  }
  return { city: f.city, n, dim, lon, lat, d, v, norm, g, top };
}

export async function isMockData(): Promise<boolean> {
  return (await getBase()) === "/data-mock";
}
