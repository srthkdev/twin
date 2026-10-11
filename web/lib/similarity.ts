import type { Hood, PackedCells, SharedDim, TwinMatch } from "./types";

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
}

/** Cosine similarity of one vector against every packed cell. */
export function cellSimilarities(cells: PackedCells, vec: ArrayLike<number>): Float32Array {
  const { n, dim, v, norm } = cells;
  const out = new Float32Array(n);
  let nv = 0;
  for (let k = 0; k < dim; k++) nv += vec[k] * vec[k];
  nv = Math.sqrt(nv) || 1;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * dim;
    for (let k = 0; k < dim; k++) s += v[o + k] * vec[k];
    out[i] = s / (norm[i] * nv);
  }
  return out;
}

export function quantile(arr: Float32Array | number[], q: number): number {
  const s = Array.from(arr).sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Normalise to 0..1 using robust (p3..p99) bounds so colour contrast is high. */
export function normalizeRobust(arr: Float32Array): { t: Float32Array; lo: number; hi: number } {
  const lo = quantile(arr, 0.03), hi = quantile(arr, 0.995);
  const span = hi - lo || 1;
  const t = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) t[i] = Math.min(1, Math.max(0, (arr[i] - lo) / span));
  return { t, lo, hi };
}

export function explainMatch(a: ArrayLike<number>, b: ArrayLike<number>, nShared = 6, nDiverge = 4): { shared: SharedDim[]; diverge: SharedDim[] } {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const idx = Array.from({ length: a.length }, (_, i) => i);
  const shared = idx.filter((i) => a[i] > 0 && b[i] > 0).sort((p, q) => Math.min(b[q], a[q]) - Math.min(b[p], a[p])).slice(0, nShared)
    .map((i) => ({ i, a: r3(a[i]), b: r3(b[i]) }));
  const diverge = idx.sort((p, q) => Math.abs(a[q] - b[q]) - Math.abs(a[p] - b[p])).slice(0, nDiverge).map((i) => ({ i, a: r3(a[i]), b: r3(b[i]) }));
  return { shared, diverge };
}

/** Rank hoods of a target city by cosine to a vector. */
export function rankHoods(vec: ArrayLike<number>, hoods: Hood[], cityId: string, k = 5): TwinMatch[] {
  return hoods
    .filter((h) => h.city === cityId)
    .map((h) => ({ h, s: cosine(vec, h.v) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(({ h, s }) => ({ hood: h.id, score: Math.round(s * 1000) / 1000, ...explainMatch(vec, h.v) }));
}

export function nearestCell(cells: PackedCells, lon: number, lat: number): number {
  let best = -1, bd = Infinity;
  const kx = Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i < cells.n; i++) {
    const dx = (cells.lon[i] - lon) * kx, dy = cells.lat[i] - lat;
    const dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
}
export const cellVector = (cells: PackedCells, i: number): number[] => Array.from(cells.v.subarray(i * cells.dim, (i + 1) * cells.dim));

/** Mean vector of cells within radiusKm of a point (used for dropped pins). */
export function neighbourhoodVector(cells: PackedCells, lon: number, lat: number, radiusKm = 1.3): number[] {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 111.32;
  const out = new Array(cells.dim).fill(0);
  let c = 0;
  for (let i = 0; i < cells.n; i++) {
    const dx = (cells.lon[i] - lon) * kx, dy = (cells.lat[i] - lat) * ky;
    if (dx * dx + dy * dy <= radiusKm * radiusKm) {
      c++;
      for (let k = 0; k < cells.dim; k++) out[k] += cells.v[i * cells.dim + k];
    }
  }
  if (!c) return cellVector(cells, nearestCell(cells, lon, lat));
  for (let k = 0; k < cells.dim; k++) out[k] /= c;
  return out;
}

export const fmtScore = (s: number) => s.toFixed(2);
