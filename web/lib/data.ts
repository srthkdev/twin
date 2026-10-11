import type { BasketItem, CellsFile, City, DataSet, Evals, Hood, Meta, PackedCells, TwinsFile } from "./types";

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
export const loadCities = () => load<City[]>("cities.json");
export const loadHoods = () => load<Hood[]>("hoods.json");
export const loadTwins = () => load<TwinsFile>("twins.json");
export const loadEvals = () => load<Evals>("evals.json");

export async function loadDataSet(): Promise<DataSet> {
  const [basket, cities, hoods, twins] = await Promise.all([loadBasket(), loadCities(), loadHoods(), loadTwins()]);
  return { basket, cities, hoods, twins };
}

const packedCache = new Map<string, Promise<PackedCells>>();
/** Loads cells for a city and packs them into typed arrays (cached). */
export function loadCells(cityId: string): Promise<PackedCells> {
  let p = packedCache.get(cityId);
  if (!p) {
    p = load<CellsFile>(`cells/${cityId}.json`).then(pack);
    p.catch(() => packedCache.delete(cityId));
    packedCache.set(cityId, p);
  }
  return p;
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
