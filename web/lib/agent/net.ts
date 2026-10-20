// Polite HTTP for the free sources (Nominatim, Overpass, Wikipedia, search, r.jina.ai): timeouts, disk cache, mirrors.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { storeCached, storeGet, storePut } from "./store";
import { ToolError } from "./tool-kit";

export const UA = "twin-hackathon/0.1 (+https://github.com/srthkdev/twin)";
export const webRoot = () => process.env.TWIN_WEB_ROOT ?? process.cwd();
export const cachePath = (...p: string[]) => join(webRoot(), ".cache", "twin", ...p);
const sha = (s: string) => createHash("sha1").update(s).digest("hex");

// Paths under the cache root go through the shared store (Vercel Blob in production); anything else is a plain file.
const storeKey = (file: string) => { const r = relative(cachePath(), file); return r && !r.startsWith("..") ? r : null; };
export async function readJson<T>(file: string, o: { fresh?: boolean } = {}): Promise<T | null> {
  const k = storeKey(file);
  if (k) return storeGet<T>(k, o);
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return null; }
}
export async function writeJson(file: string, data: unknown) {
  const k = storeKey(file);
  if (k) return storePut(k, data);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

/** Disk cache keyed by (namespace, key); misses call fn and store the result (only when it does not throw). */
export async function diskCached<T>(ns: string, key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  return storeCached(`http/${ns}/${sha(key)}.json`, ttlMs, fn);
}

export async function httpText(url: string, o: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url, {
      method: o.method ?? "GET", body: o.body, cache: "no-store", redirect: "follow",
      headers: { "User-Agent": UA, ...o.headers }, signal: AbortSignal.timeout(o.timeoutMs ?? 20000),
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    const host = (() => { try { return new URL(url).host; } catch { return "host"; } })();
    throw new ToolError(`${host} request failed: ${e instanceof Error ? (e.name === "TimeoutError" ? "timeout" : e.message) : "network error"}`);
  }
}
export async function httpJson<T>(url: string, o: Parameters<typeof httpText>[1] = {}): Promise<T> {
  const r = await httpText(url, { ...o, headers: { Accept: "application/json", ...o.headers } });
  if (r.status < 200 || r.status >= 300) throw new ToolError(`${new URL(url).host} HTTP ${r.status}`);
  try { return JSON.parse(r.text) as T; } catch { throw new ToolError(`${new URL(url).host} returned non-JSON`); }
}

// ── Nominatim: one request per 1.1 s process-wide ──
let nomChain: Promise<unknown> = Promise.resolve();
let nomLast = 0;
export function nominatimSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = nomChain.then(async () => {
    const wait = nomLast + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await fn(); } finally { nomLast = Date.now(); }
  });
  nomChain = run.catch(() => undefined);
  return run;
}

export interface GeoHit { name: string; display: string; lat: number; lon: number; bbox: [number, number, number, number]; type: string; country: string; osm?: string }
interface NomRow { name?: string; display_name: string; lat: string; lon: string; boundingbox: string[]; type: string; class: string; osm_type?: string; osm_id?: number; address?: Record<string, string>; importance?: number }

/** Nominatim search -> best hit(s). bbox = [south, west, north, east]. Cached 30 days. */
export async function geocode(query: string, limit = 1): Promise<GeoHit[]> {
  const q = query.trim().slice(0, 200);
  if (!q) throw new ToolError("empty place name");
  const rows = await diskCached<NomRow[]>("nominatim", `${q}|${limit}`, 30 * 86400_000, () =>
    nominatimSlot(() => httpJson<NomRow[]>(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&accept-language=en&q=${encodeURIComponent(q)}`, { timeoutMs: 15000 })));
  return rows.map((r) => ({
    name: r.name || r.display_name.split(",")[0].trim(),
    display: r.display_name, lat: +r.lat, lon: +r.lon,
    bbox: [+r.boundingbox[0], +r.boundingbox[2], +r.boundingbox[1], +r.boundingbox[3]] as [number, number, number, number],
    type: `${r.class}/${r.type}`, country: r.address?.country ?? r.display_name.split(",").pop()!.trim(),
    osm: r.osm_type && r.osm_id ? `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}` : undefined,
  }));
}

// ── Overpass with mirror fallback ──
export const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
export interface OsmEl { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

export async function overpass(query: string, o: { ttlMs?: number; timeoutMs?: number } = {}): Promise<OsmEl[]> {
  return diskCached<OsmEl[]>("overpass", query, o.ttlMs ?? 3 * 86400_000, async () => {
    const errs: string[] = [];
    for (const base of OVERPASS) {
      try {
        const r = await httpText(base, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, timeoutMs: o.timeoutMs ?? 25000 });
        if (r.status !== 200) { errs.push(`${new URL(base).host} HTTP ${r.status}`); continue; }
        const j = JSON.parse(r.text) as { elements?: OsmEl[]; remark?: string };
        if (j.remark && /timed out|out of memory/i.test(j.remark) && !(j.elements?.length)) { errs.push(`${new URL(base).host} ${j.remark.slice(0, 60)}`); continue; }
        return j.elements ?? [];
      } catch (e) { errs.push(`${new URL(base).host}: ${e instanceof Error ? e.message : "failed"}`.slice(0, 120)); }
    }
    throw new ToolError(`Overpass unavailable (${errs.join("; ")})`);
  });
}
