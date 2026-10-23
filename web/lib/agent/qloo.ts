// Live Qloo client for the agent: timeouts, in-memory + on-disk cache, call counters.
// The API key comes from env QLOO_API_KEY (web/.env.local). It is never logged or returned.
import { createHash } from "node:crypto";
import { storeGet, storePut } from "./store";
import { geocode } from "./net";

export interface QlooStats { live: number; cached: number }
export const newStats = (): QlooStats => ({ live: 0, cached: 0 });
export const qlooConfigured = () => !!(process.env.QLOO_API_KEY && process.env.QLOO_BASE_URL);

const mem = new Map<string, unknown>();
// Taste data moves slowly; a month keeps the quota for new questions instead of repeats.
const TTL_MS = 30 * 24 * 3600 * 1000;

export class QlooError extends Error {}

// Qloo's key allows ~5 requests/s; a report fires dozens. Pace live calls (cache hits skip this) and retry one 429.
const GAP_MS = 160; // Qloo allows 10 requests/s; leave headroom for parallel instances
let nextSlot = 0;
const slot = () => { const now = Date.now(), at = Math.max(now, nextSlot); nextSlot = at + GAP_MS; return new Promise((r) => setTimeout(r, at - now)); };

export async function qlooGet<T = unknown>(path: string, params: Record<string, string | number>, stats?: QlooStats, timeoutMs = 25000): Promise<T> {
  const base = process.env.QLOO_BASE_URL, key = process.env.QLOO_API_KEY;
  if (!base || !key) throw new QlooError("Qloo is not configured (set QLOO_API_KEY and QLOO_BASE_URL in web/.env.local)");
  const qs = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, String(v)])).toString();
  const url = `${base.replace(/\/$/, "")}${path}?${qs}`;
  const h = createHash("sha1").update(url).digest("hex");
  if (mem.has(h)) { if (stats) stats.cached++; return mem.get(h) as T; }
  const raw = await storeGet<{ t: number; d: T }>(`qloo/${h}.json`);
  if (raw && Date.now() - raw.t < TTL_MS) { mem.set(h, raw.d); if (stats) stats.cached++; return raw.d; }
  try { return await live<T>(url, key, h, stats, timeoutMs); }
  catch (e) {
    // An older answer beats no answer when Qloo is down or rate-limited.
    if (raw) { if (stats) stats.cached++; return raw.d; }
    throw e;
  }
}

async function live<T>(url: string, key: string, h: string, stats: QlooStats | undefined, timeoutMs: number): Promise<T> {
  const path = new URL(url).pathname;
  if (stats) stats.live++;
  let res: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    await slot();
    try {
      res = await fetch(url, { headers: { "X-Api-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    } catch (e) {
      throw new QlooError(`Qloo request failed: ${e instanceof Error ? e.name === "TimeoutError" ? "timeout" : e.message : "network error"}`);
    }
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (!res) throw new QlooError("Qloo request failed");
  if (!res.ok) throw new QlooError(`Qloo HTTP ${res.status} on ${path}`);
  const data = (await res.json()) as T;
  mem.set(h, data);
  await storePut(`qloo/${h}.json`, { t: Date.now(), d: data });
  return data;
}

// ───────────── Qloo-native helpers (all go through the cached qlooGet) ─────────────
export interface QlooTag { id: string; name: string; affinity?: number }

/** Entity search (/search): first match with its id and types. */
export async function qlooSearchEntity(text: string, stats?: QlooStats, type?: string): Promise<{ id: string; name: string; types: string[] } | null> {
  const r = await qlooGet<{ results?: { name: string; entity_id: string; types?: string[] }[] }>("/search", { query: text, take: type ? 5 : 1 }, stats);
  const hit = type ? r.results?.find((e) => e.types?.includes(type)) ?? r.results?.[0] : r.results?.[0];
  return hit ? { id: hit.entity_id, name: hit.name, types: hit.types ?? [] } : null;
}

/** Resolve free text to a Qloo place tag id (prefers the curated urn:tag:genre:place family). */
export async function qlooResolveTag(text: string, stats?: QlooStats): Promise<QlooTag | null> {
  const r = await qlooGet<{ results?: { tags?: { id: string; name: string }[] } }>("/v2/tags", { "filter.query": text, "filter.parents.types": "urn:entity:place", take: 8 }, stats);
  const tags = r.results?.tags ?? [];
  const t = tags.find((x) => x.id.startsWith("urn:tag:genre:place")) ?? tags[0];
  return t ? { id: t.id, name: t.name } : null;
}

export interface Scene { tags: QlooTag[]; audiences: string[]; artists: string[]; brands: string[] }
/** What a place over-indexes on, straight from Qloo (location-signal insights). Each facet is best-effort. */
export async function qlooScene(place: string, stats?: QlooStats, take = 12): Promise<Scene> {
  const once = async (sig: Record<string, string | number>) => {
    const errors: string[] = [];
    const safe = async <T,>(p: Promise<T>, d: T) => { try { return await p; } catch (err) { errors.push(err instanceof Error ? err.message : String(err)); return d; } };
    const [tags, aud, art, brand] = await Promise.all([
      safe(qlooGet<{ results?: { tags?: { tag_id: string; name: string; query?: { affinity?: number } }[] } }>("/v2/insights", { "filter.type": "urn:tag", "filter.tag.types": "urn:tag:genre:place", take, ...sig }, stats), {}),
      safe(qlooGet<{ results?: { entities?: { name: string }[] } }>("/v2/insights", { "filter.type": "urn:audience", take: 8, ...sig }, stats), {}),
      safe(qlooGet<{ results?: { entities?: { name: string }[] } }>("/v2/insights", { "filter.type": "urn:entity:artist", take: 8, ...sig }, stats), {}),
      safe(qlooGet<{ results?: { entities?: { name: string }[] } }>("/v2/insights", { "filter.type": "urn:entity:brand", take: 8, ...sig }, stats), {}),
    ]);
    const scene: Scene = {
      tags: ((tags as { results?: { tags?: { tag_id: string; name: string; query?: { affinity?: number } }[] } }).results?.tags ?? []).map((t) => ({ id: t.tag_id, name: t.name, affinity: t.query?.affinity })),
      audiences: ((aud as { results?: { entities?: { name: string }[] } }).results?.entities ?? []).map((x) => x.name),
      artists: ((art as { results?: { entities?: { name: string }[] } }).results?.entities ?? []).map((x) => x.name),
      brands: ((brand as { results?: { entities?: { name: string }[] } }).results?.entities ?? []).map((x) => x.name),
    };
    return { scene, errors, empty: !scene.tags.length && !scene.artists.length && !scene.brands.length };
  };
  let r = await once({ "signal.location.query": place });
  // Qloo can't resolve every neighbourhood name; the same question by coordinates usually works.
  if (r.empty) {
    const g = (await geocode(place).catch(() => []))[0];
    if (g) r = await once({ "signal.location": `POINT(${g.lon} ${g.lat})`, "signal.location.radius": 1500 });
  }
  if (r.empty && r.errors.length) throw new QlooError(r.errors[0]);
  return r.scene;
}

/** Qloo's own shared-characteristics list for two sets of entities (/v2/insights/compare). */
export async function qlooCompare(aIds: string[], bIds: string[], stats?: QlooStats, take = 10): Promise<{ name: string; score: number }[]> {
  if (!aIds.length || !bIds.length) return [];
  const r = await qlooGet<{ results?: { tags?: { name: string; query?: { score?: number } }[] } }>("/v2/insights/compare", {
    "filter.type": "urn:tag", "a.signal.interests.entities": aIds.join(","), "b.signal.interests.entities": bIds.join(","), take,
  }, stats);
  return (r.results?.tags ?? []).slice(0, take).map((t) => ({ name: t.name, score: Math.round((t.query?.score ?? 0) * 1000) / 1000 }));
}

export interface TrendPoint { date: string; percentile: number; rank: number | null; velocity: number | null }
export async function qlooTrend(entityId: string, filterType: string, months: number, stats?: QlooStats): Promise<TrendPoint[]> {
  const end = new Date(), start = new Date(end.getTime() - months * 30.4 * 86400_000), d = (x: Date) => x.toISOString().slice(0, 10);
  const r = await qlooGet<{ results?: { trending?: { date: string; population_percentile: number; population_rank?: string; population_rank_velocity?: number }[] } }>("/v2/trending", {
    "filter.type": filterType, "signal.interests.entities": entityId, "filter.start_date": d(start), "filter.end_date": d(end), take: 50,
  }, stats);
  return (r.results?.trending ?? []).map((p) => ({ date: p.date, percentile: p.population_percentile, rank: p.population_rank ? +p.population_rank : null, velocity: p.population_rank_velocity ?? null })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Qloo `properties.hours` -> "Mon 15:00-03:00, Tue ...". */
export function fmtHours(h: unknown): string | undefined {
  if (!h || typeof h !== "object") return undefined;
  const days: [string, string][] = [["monday", "Mon"], ["tuesday", "Tue"], ["wednesday", "Wed"], ["thursday", "Thu"], ["friday", "Fri"], ["saturday", "Sat"], ["sunday", "Sun"]];
  const out: string[] = [];
  for (const [k, lab] of days) {
    const slots = (h as Record<string, { opens?: string; closes?: string; closed?: boolean }[]>)[k];
    if (!slots?.length) continue;
    out.push(`${lab} ${slots.map((s) => (s.closed ? "closed" : `${(s.opens ?? "").replace(/^T/, "").slice(0, 5)}-${(s.closes ?? "").replace(/^T/, "").slice(0, 5)}`)).join(", ")}`);
  }
  return out.length ? out.join("; ") : undefined;
}
