// Live Qloo client for the agent: timeouts, in-memory + on-disk cache, call counters.
// The API key comes from env QLOO_API_KEY (web/.env.local). It is never logged or returned.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface QlooStats { live: number; cached: number }
export const newStats = (): QlooStats => ({ live: 0, cached: 0 });
export const qlooConfigured = () => !!(process.env.QLOO_API_KEY && process.env.QLOO_BASE_URL);

const mem = new Map<string, unknown>();
const CACHE_DIR = join(tmpdir(), "twin-qloo-cache");
const TTL_MS = 24 * 3600 * 1000;

export class QlooError extends Error {}

export async function qlooGet<T = unknown>(path: string, params: Record<string, string | number>, stats?: QlooStats, timeoutMs = 25000): Promise<T> {
  const base = process.env.QLOO_BASE_URL, key = process.env.QLOO_API_KEY;
  if (!base || !key) throw new QlooError("Qloo is not configured (set QLOO_API_KEY and QLOO_BASE_URL in web/.env.local)");
  const qs = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, String(v)])).toString();
  const url = `${base.replace(/\/$/, "")}${path}?${qs}`;
  const h = createHash("sha1").update(url).digest("hex");
  if (mem.has(h)) { if (stats) stats.cached++; return mem.get(h) as T; }
  const file = join(CACHE_DIR, h + ".json");
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { t: number; d: T };
    if (Date.now() - raw.t < TTL_MS) { mem.set(h, raw.d); if (stats) stats.cached++; return raw.d; }
  } catch { /* miss */ }
  if (stats) stats.live++;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-Api-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (e) {
    throw new QlooError(`Qloo request failed: ${e instanceof Error ? e.name === "TimeoutError" ? "timeout" : e.message : "network error"}`);
  }
  if (!res.ok) throw new QlooError(`Qloo HTTP ${res.status} on ${path}`);
  const data = (await res.json()) as T;
  mem.set(h, data);
  try { await mkdir(CACHE_DIR, { recursive: true }); await writeFile(file, JSON.stringify({ t: Date.now(), d: data })); } catch { /* cache is best-effort */ }
  return data;
}
