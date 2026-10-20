import type { City, DataSet, Hood, TwinMatch } from "../types";
import { cosine, explainMatch as explain, rankHoods } from "../similarity";

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function findHood(ds: DataSet, text: string, cityId?: string | null): Hood | null {
  const q = " " + norm(text) + " ";
  let best: { h: Hood; s: number } | null = null;
  for (const h of ds.hoods) {
    if (cityId && h.city !== cityId) continue;
    const full = norm(h.name);
    const toks = full.split(" ").filter((t) => t.length > 2 && !["the", "and", "der", "von"].includes(t));
    if (!toks.length) continue;
    let s = 0;
    if (q.includes(" " + full + " ")) s = 10 + full.length;
    else {
      const hit = toks.filter((t) => q.includes(" " + t + " ") || q.includes(" " + t)).length;
      if (hit / toks.length >= 0.5) s = (hit / toks.length) * 5 + toks.filter((t) => q.includes(t)).join("").length * 0.1;
    }
    if (s > 0 && (!best || s > best.s)) best = { h, s };
  }
  return best?.h ?? null;
}

const CITY_ALIASES: Record<string, string[]> = {
  "los-angeles": ["los angeles", "la", "l a"],
  "new-york": ["new york", "nyc", "ny", "manhattan", "brooklyn"],
  london: ["london"],
  berlin: ["berlin"],
  "mexico-city": ["mexico city", "cdmx", "mexico", "df"],
  paris: ["paris"],
};
export function findCity(ds: DataSet, text: string): string | null {
  const q = " " + norm(text) + " ";
  let best: { id: string; len: number } | null = null;
  for (const c of ds.cities) {
    for (const a of [norm(c.name), ...(CITY_ALIASES[c.id] ?? [])]) {
      if (q.includes(" " + a + " ") && (!best || a.length > best.len)) best = { id: c.id, len: a.length };
    }
  }
  return best?.id ?? null;
}

export function listHoods(ds: DataSet, cityId: string): Hood[] {
  return ds.hoods.filter((h) => h.city === cityId);
}

export function findTwins(ds: DataSet, hoodId: string, cityId: string, k = 5): TwinMatch[] {
  const pre = ds.twins[hoodId]?.[cityId];
  if (pre?.length) return pre.slice(0, k);
  const h = ds.hoods.find((x) => x.id === hoodId);
  return h ? rankHoods(h.v, ds.hoods, cityId, k) : [];
}

export function explainMatch(ds: DataSet, aId: string, bId: string) {
  const a = ds.hoods.find((h) => h.id === aId), b = ds.hoods.find((h) => h.id === bId);
  if (!a || !b) return null;
  const pre = ds.twins[aId]?.[b.city]?.find((t) => t.hood === bId);
  const score = pre?.score ?? cosine(a.v, b.v);
  const ex = pre ? { shared: pre.shared, diverge: pre.diverge } : explain(a.v, b.v);
  return { a, b, score: Math.round(score * 1000) / 1000, ...ex };
}

// ───────────────────────────── Tool registry (single source of truth) ─────────────────────────────
// Consumed by: the Anthropic/OpenAI agent loops, the OpenRouter loop, and mcp/twin-mcp.mts.
import { z } from "zod";
import type { AgentAction } from "./types";
import type { CellsFile } from "../types";
import { BASKET_KEYS, loadCellsFile, loadDataSet } from "./node-data";
import { QlooError, fmtHours, newStats, qlooConfigured, qlooGet, qlooResolveTag, type QlooStats } from "./qloo";

import { TOOLS_V2 } from "./tools-v2";
import { ToolError, defineTool, type ToolContext, type ToolDef, type ToolOutput } from "./tool-kit";
export type { ToolContext, ToolDef, ToolOutput };

const r2 = (x: number) => Math.round(x * 100) / 100;

const CITY_QUERY: Record<string, string> = {
  "los-angeles": "Los Angeles County", "new-york": "New York City", london: "London", berlin: "Berlin", "mexico-city": "Mexico City", paris: "Paris and suburbs",
};

function resolveCity(ds: DataSet, text: string): string {
  if (ds.cities.some((c) => c.id === text)) return text;
  const c = findCity(ds, text);
  if (!c) throw new ToolError(`Unknown city "${text}". Valid: ${ds.cities.map((x) => x.id).join(", ")}`);
  return c;
}
function resolveHood(ds: DataSet, text: string): Hood {
  const byId = ds.hoods.find((h) => h.id === text);
  if (byId) return byId;
  const h = findHood(ds, text);
  if (!h) throw new ToolError(`Unknown neighbourhood "${text}". Use search_hoods to find a valid hood_id.`);
  return h;
}
const label = (ds: DataSet, i: number) => ds.basket[i]?.label ?? `#${i}`;
const hoodName = (ds: DataSet, id: string) => ds.hoods.find((h) => h.id === id)?.name ?? id;

type Resolved = { kind: "item"; dims: number[]; name: string } | { kind: "group"; dims: number[]; name: string };
function resolveItem(ds: DataSet, text: string): Resolved | null {
  const q = norm(text);
  if (!q) return null;
  const groups = [...new Set(ds.basket.map((b) => b.group))];
  const g = groups.find((x) => x === q);
  if (g) return { kind: "group", name: g, dims: ds.basket.filter((b) => b.group === g).map((b) => b.i) };
  let best: { i: number; s: number } | null = null;
  for (const b of ds.basket) {
    const l = norm(b.label), id = norm(b.id.replace(/^[a-z]+-/, ""));
    let s = 0;
    if (l === q || id === q) s = 100;
    else if (l.includes(q) || q.includes(l)) s = 60 + Math.min(l.length, q.length);
    else {
      const qt = q.split(" ").filter((t) => t.length > 2);
      const hit = qt.filter((t) => l.includes(t)).length;
      if (qt.length && hit === qt.length) s = 40 + hit;
    }
    if (s && (!best || s > best.s)) best = { i: b.i, s };
  }
  return best ? { kind: "item", name: label(ds, best.i), dims: [best.i] } : null;
}
const avg = (v: ArrayLike<number>, dims: number[]) => dims.reduce((s, d) => s + v[d], 0) / dims.length;
const pctRank = (sorted: number[], x: number) => {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; }
  return sorted.length ? lo / sorted.length : 0;
};
const hav = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000, p = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
function nearestHood(ds: DataSet, city: string, lat: number, lon: number) {
  let best: { h: Hood; d: number } | null = null;
  for (const h of ds.hoods) if (h.city === city) { const d = hav(lat, lon, h.lat, h.lon); if (!best || d < best.d) best = { h, d }; }
  return best;
}

function twinRows(ds: DataSet, vec: ArrayLike<number>, matches: TwinMatch[], city: string) {
  const all = ds.hoods.filter((h) => h.city === city).map((h) => cosine(vec, h.v)).sort((a, b) => a - b);
  return matches.map((m, rank) => ({
    rank: rank + 1,
    hood_id: m.hood,
    name: hoodName(ds, m.hood),
    cosine_similarity: m.score,
    percentile_in_city: r2(pctRank(all, m.score) * 100),
    shared_traits: m.shared.slice(0, 5).map((s) => ({ trait: label(ds, s.i), source_z: s.a, twin_z: s.b })),
    diverging_traits: m.diverge.slice(0, 3).map((s) => ({ trait: label(ds, s.i), source_z: s.a, twin_z: s.b })),
  }));
}

// ───────────────────────────── Data tools ─────────────────────────────
const list_cities = defineTool({
  name: "list_cities",
  description: "List the 6 cities in the dataset with their ids, neighbourhood counts and neighbourhood ids/names. Call this first if you are unsure what exists.",
  schema: z.object({}),
  async run(_a, { ds }) {
    const data = ds.cities.map((c) => ({ id: c.id, name: c.name, country: c.country, hoods: ds.hoods.filter((h) => h.city === c.id).map((h) => ({ id: h.id, name: h.name })) }));
    return { data, summary: `${data.length} cities, ${ds.hoods.length} neighbourhoods` };
  },
});

const search_hoods = defineTool({
  name: "search_hoods",
  description: "Fuzzy-find neighbourhoods by name (e.g. 'silver lake', 'neukolln', 'shoreditch'). Returns hood_ids to use with other tools.",
  schema: z.object({ query: z.string().describe("neighbourhood name or partial name"), city: z.string().optional().describe("optional city id/name to restrict to") }),
  async run({ query, city }, { ds }) {
    const cityId = city ? resolveCity(ds, city) : null;
    const q = norm(query);
    const toks = q.split(" ").filter((t) => t.length > 1);
    const scored = ds.hoods
      .filter((h) => !cityId || h.city === cityId)
      .map((h) => {
        const n = norm(h.name);
        let s = n === q ? 100 : n.includes(q) ? 60 : q.includes(n) ? 50 : 0;
        s += toks.filter((t) => n.includes(t)).length * 10;
        return { h, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map(({ h }) => ({ hood_id: h.id, name: h.name, city: h.city, blurb: h.blurb ?? null, top_traits: h.top.slice(0, 4).map((i) => label(ds, i)) }));
    return { data: scored, summary: scored.length ? `${scored.length} match${scored.length > 1 ? "es" : ""}: ${scored.slice(0, 3).map((x) => x.name).join(", ")}` : "no match" };
  },
});

const find_twins = defineTool({
  name: "find_twins",
  description: "Find the cultural twins of a neighbourhood in another city (cosine similarity over density-corrected Qloo taste fingerprints). Returns ranked twins with similarity, percentile within the target city, shared and diverging traits. Also moves the map.",
  schema: z.object({
    hood_id: z.string().describe("source neighbourhood id or name, e.g. 'los-angeles-silver-lake'"),
    target_city: z.string().describe("target city id or name, e.g. 'berlin'"),
    k: z.number().int().min(1).max(5).optional().describe("number of twins (default 3)"),
  }),
  async run({ hood_id, target_city, k }, { ds }) {
    const h = resolveHood(ds, hood_id);
    const city = resolveCity(ds, target_city);
    if (city === h.city) throw new ToolError(`${h.name} is already in ${city}; choose a different target city.`);
    const tw = findTwins(ds, h.id, city, k ?? 3);
    const rows = twinRows(ds, h.v, tw, city);
    const top = rows[0];
    return {
      data: { source: { hood_id: h.id, name: h.name, city: h.city }, target_city: city, twins: rows },
      summary: top ? `${h.name} -> ${top.name} (${top.cosine_similarity}), ${rows.length} twin${rows.length > 1 ? "s" : ""}` : "no twins",
      uiActions: top ? [{ type: "showTwins", from: h.id, to: city, twin: top.hood_id }] : [],
    };
  },
});

const explain_match = defineTool({
  name: "explain_match",
  description: "Explain why two neighbourhoods are (or are not) similar: shared high traits and the biggest divergences, with z-score values (z = how far above/below the city's typical level; ~1 is notable, >2 strong).",
  schema: z.object({ hood_a: z.string(), hood_b: z.string() }),
  async run({ hood_a, hood_b }, { ds }) {
    const a = resolveHood(ds, hood_a), b = resolveHood(ds, hood_b);
    const ex = explainMatch(ds, a.id, b.id)!;
    const all = ds.hoods.filter((h) => h.city === b.city).map((h) => cosine(a.v, h.v)).sort((x, y) => x - y);
    const data = {
      a: { hood_id: a.id, name: a.name, city: a.city }, b: { hood_id: b.id, name: b.name, city: b.city },
      cosine_similarity: ex.score,
      percentile_of_b_among_its_city: a.city !== b.city ? r2(pctRank(all, ex.score) * 100) : null,
      shared_traits: ex.shared.map((s) => ({ trait: label(ds, s.i), group: ds.basket[s.i]?.group, z_a: s.a, z_b: s.b })),
      diverging_traits: ex.diverge.map((s) => ({ trait: label(ds, s.i), group: ds.basket[s.i]?.group, z_a: s.a, z_b: s.b })),
    };
    return { data, summary: `${a.name} vs ${b.name}: cosine ${ex.score}, ${ex.shared.length} shared`, uiActions: a.city !== b.city ? [{ type: "showTwins", from: a.id, to: b.city, twin: b.id }] : [] };
  },
});

const taste_profile = defineTool({
  name: "taste_profile",
  description: "A neighbourhood's measured taste fingerprint: strongest and weakest traits (z-scores vs its own city, density-corrected) and the strongest trait per group.",
  schema: z.object({ hood_id: z.string() }),
  async run({ hood_id }, { ds }) {
    const h = resolveHood(ds, hood_id);
    const idx = h.v.map((x, i) => [x, i] as const).sort((p, q) => q[0] - p[0]);
    const fmt = ([z, i]: readonly [number, number]) => ({ trait: label(ds, i), group: ds.basket[i]?.group, kind: ds.basket[i]?.kind, z: r2(z) });
    const groups = [...new Set(ds.basket.map((b) => b.group))];
    const by_group = Object.fromEntries(groups.map((g) => [g, idx.filter(([, i]) => ds.basket[i]?.group === g).slice(0, 2).map(fmt)]));
    const data = { hood_id: h.id, name: h.name, city: h.city, blurb: h.blurb ?? null, coordinates: { lat: h.lat, lon: h.lon }, top: idx.slice(0, 8).map(fmt), bottom: idx.slice(-5).reverse().map(fmt), by_group };
    return { data, summary: `${h.name}: top ${data.top.slice(0, 3).map((t) => t.trait).join(", ")}`, uiActions: [{ type: "flyTo", hood: h.id }] };
  },
});

async function cellStats(ds: DataSet, city: string): Promise<CellsFile> {
  void ds;
  return loadCellsFile(city);
}

const where_in_city = defineTool({
  name: "where_in_city",
  description:
    "Where in a city does a taste item (artist, brand, food tag, venue type... from the 116-item basket) or a whole group (music, food, nightlife, film, culture, lifestyle, sport, fashion) concentrate? Uses density-corrected Qloo heatmaps: top neighbourhoods and top cells, plus a comparison against raw density. If the item is not in the basket and Qloo is configured, falls back to a live Qloo heatmap with a single-item density correction.",
  schema: z.object({
    city: z.string(),
    item_or_group: z.string().describe("e.g. 'Peso Pluma', 'Vegan restaurants', 'nightlife'"),
    k: z.number().int().min(1).max(8).optional(),
  }),
  async run({ city, item_or_group, k }, { ds, stats }) {
    const cityId = resolveCity(ds, city);
    const kk = k ?? 5;
    const cf = await cellStats(ds, cityId);
    const res = resolveItem(ds, item_or_group);
    const dSorted = cf.cells.map((c) => c.d).sort((a, b) => a - b);
    if (res) {
      const vals = cf.cells.map((c) => avg(c.v, res.dims));
      const order = vals.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
      const topCells = order.slice(0, kk).map(([v, i]) => {
        const c = cf.cells[i]; const nh = nearestHood(ds, cityId, c.lat, c.lon);
        return { geohash: c.g, lat: c.lat, lon: c.lon, near: nh?.h.name, km_from_it: nh ? r2(nh.d / 1000) : null, corrected_z: r2(v), density_percentile: r2(pctRank(dSorted, c.d) * 100) };
      });
      const hoods = ds.hoods.filter((h) => h.city === cityId).map((h) => ({ h, v: avg(h.v, res.dims) })).sort((a, b) => b.v - a.v);
      const byDensity = cf.cells.map((c, i) => [c.d, i] as const).sort((a, b) => b[0] - a[0]).slice(0, kk).map(([, i]) => i);
      const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
      const mx = mean(vals), md = mean(cf.cells.map((c) => c.d));
      let sxy = 0, sxx = 0, syy = 0;
      cf.cells.forEach((c, i) => { sxy += (vals[i] - mx) * (c.d - md); sxx += (vals[i] - mx) ** 2; syy += (c.d - md) ** 2; });
      const corr = sxy / Math.sqrt(sxx * syy || 1);
      const data = {
        city: cityId, query: res.name, kind: res.kind, source: "precomputed Qloo heatmaps, density-corrected",
        top_hoods: hoods.slice(0, kk).map(({ h, v }) => ({ hood_id: h.id, name: h.name, corrected_z: r2(v) })),
        top_cells: topCells,
        raw_density_comparison: {
          note: "Raw Qloo affinity tracks popularity; correction removes that. Corr near 0 means the corrected map is independent of how busy a place is.",
          correlation_corrected_vs_density: r2(corr),
          mean_density_percentile_of_top_corrected_cells: r2(mean(topCells.map((c) => c.density_percentile))),
          mean_density_percentile_of_top_raw_density_cells: r2(mean(byDensity.map((i) => pctRank(dSorted, cf.cells[i].d) * 100))),
        },
      };
      const lead = hoods[0];
      return {
        data, summary: `${res.name} in ${cityId}: ${hoods.slice(0, 3).map((x) => x.h.name).join(", ")}`,
        uiActions: res.kind === "item" ? [{ type: "highlightCells", city: cityId, item: res.dims[0], label: res.name }] : lead ? [{ type: "flyTo", hood: lead.h.id }] : [],
      };
    }
    // Live fallback for items outside the basket.
    if (!qlooConfigured()) throw new ToolError(`"${item_or_group}" is not in the basket and Qloo live access is not configured.`);
    const q = CITY_QUERY[cityId];
    const ent = await resolveEntity(item_or_group, stats);
    const r = await qlooGet<{ results?: { heatmap?: { location: { geohash: string; latitude: number; longitude: number }; query: { affinity: number } }[] } }>(
      "/v2/insights", { "filter.type": "urn:heatmap", "filter.location.query": q, "signal.interests.entities": ent.id }, stats, 45000);
    const hm = r.results?.heatmap ?? [];
    const acc = new Map<string, { s: number; n: number }>();
    for (const x of hm) { const g = x.location.geohash.slice(0, 6); const a = acc.get(g) ?? { s: 0, n: 0 }; a.s += x.query.affinity; a.n++; acc.set(g, a); }
    const rows = cf.cells.filter((c) => acc.has(c.g)).map((c) => ({ c, aff: acc.get(c.g)!.s / acc.get(c.g)!.n }));
    if (rows.length < 20) throw new ToolError(`Qloo has too little heatmap data for "${ent.name}" in ${cityId}.`);
    const affSorted = rows.map((x) => x.aff).sort((a, b) => a - b), dS = rows.map((x) => x.c.d).sort((a, b) => a - b);
    const scored = rows.map((x) => ({ ...x, lift: pctRank(affSorted, x.aff) - pctRank(dS, x.c.d) })).sort((a, b) => b.lift - a.lift);
    const top = scored.slice(0, kk).map(({ c, aff, lift }) => ({
      geohash: c.g, lat: c.lat, lon: c.lon, near: nearestHood(ds, cityId, c.lat, c.lon)?.h.name, raw_affinity: r2(aff), raw_affinity_percentile: r2(pctRank(affSorted, aff) * 100), density_percentile: r2(pctRank(dS, c.d) * 100), density_corrected_lift: r2(lift),
    }));
    const rawTop = [...rows].sort((a, b) => b.aff - a.aff).slice(0, kk).map((x) => ({ near: nearestHood(ds, cityId, x.c.lat, x.c.lon)?.h.name, raw_affinity: r2(x.aff), density_percentile: r2(pctRank(dS, x.c.d) * 100) }));
    const hoodScore = new Map<string, number[]>();
    for (const s of scored.slice(0, 40)) { const n = nearestHood(ds, cityId, s.c.lat, s.c.lon)?.h; if (n) hoodScore.set(n.id, [...(hoodScore.get(n.id) ?? []), s.lift]); }
    const topHoods = [...hoodScore.entries()].map(([id, a]) => ({ hood_id: id, name: hoodName(ds, id), cells_in_top40: a.length })).sort((a, b) => b.cells_in_top40 - a.cells_in_top40).slice(0, kk);
    return {
      data: { city: cityId, query: ent.name, kind: "item", source: "LIVE Qloo heatmap (item not in basket); single-item correction = affinity percentile minus density percentile, approximate", top_hoods_by_cell_count: topHoods, top_cells: top, naive_raw_top_cells: rawTop, caveat: "Raw top cells are mostly just busy areas; trust the corrected ranking more." },
      summary: `live heatmap ${ent.name} in ${cityId}: ${topHoods.slice(0, 3).map((x) => x.name).join(", ")}`,
      uiActions: topHoods[0] ? [{ type: "flyTo", hood: topHoods[0].hood_id }] : [],
    };
  },
});

const pin_twins = defineTool({
  name: "pin_twins",
  description: "Drop a pin at any lat/lon inside one of the 6 cities (e.g. an address the user mentions): uses the nearest cell cluster's fingerprint (cells within 1.3 km) to find its twins in a target city.",
  schema: z.object({ lat: z.number(), lon: z.number(), target_city: z.string(), k: z.number().int().min(1).max(5).optional() }),
  async run({ lat, lon, target_city, k }, { ds }) {
    let best: { c: City; d: number } | null = null;
    for (const c of ds.cities) { const d = hav(lat, lon, c.center[1], c.center[0]); if (!best || d < best.d) best = { c, d }; }
    if (!best || best.d > 60000) throw new ToolError("That point is not within 60 km of any covered city.");
    const target = resolveCity(ds, target_city);
    if (target === best.c.id) throw new ToolError(`The pin is already in ${best.c.name}; pick another target city.`);
    const cf = await loadCellsFile(best.c.id);
    const near = cf.cells.filter((c) => hav(lat, lon, c.lat, c.lon) <= 1300);
    if (!near.length) throw new ToolError("No taste cells near that point (outside the covered urban area).");
    const dim = near[0].v.length;
    const vec = Array.from({ length: dim }, (_, d) => near.reduce((s, c) => s + c.v[d], 0) / near.length);
    const tw = rankHoods(vec, ds.hoods, target, k ?? 3);
    const nh = nearestHood(ds, best.c.id, lat, lon);
    const top = vec.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 6).map(([z, i]) => ({ trait: label(ds, i), z: r2(z) }));
    const rows = twinRows(ds, vec, tw, target);
    return {
      data: { pin: { city: best.c.id, lat, lon, cells_used: near.length, near_hood: nh?.h.name }, pin_top_traits: top, twins: rows },
      summary: `pin near ${nh?.h.name ?? best.c.name} -> ${rows[0]?.name} (${rows[0]?.cosine_similarity})`,
      uiActions: nh && rows[0] ? [{ type: "showTwins", from: nh.h.id, to: target, twin: rows[0].hood_id }] : [],
    };
  },
});

// ───────────────────────────── Live Qloo tools ─────────────────────────────
interface QEntity {
  name: string; entity_id: string; subtype?: string; tags?: { name: string }[];
  properties?: { address?: string; description?: string; short_description?: string; business_rating?: number; price_level?: number; hours?: unknown; geocode?: { neighborhood?: string } };
  query?: { affinity?: number; distance?: number };
}
const KIND_TYPE: Record<string, string> = { place: "urn:entity:place", artist: "urn:entity:artist", brand: "urn:entity:brand", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show", book: "urn:entity:book", podcast: "urn:entity:podcast", videogame: "urn:entity:videogame" };
const KINDS = ["place", "artist", "brand", "movie", "tv_show", "book", "podcast", "videogame"] as const;

async function resolveEntity(text: string, stats: QlooStats): Promise<{ id: string; name: string }> {
  const norm0 = norm(text);
  const b = Object.entries(BASKET_KEYS).find(([id, v]) => v.key === "signal.interests.entities" && norm(id.replace(/^[a-z]+-/, "")) === norm0);
  if (b) return { id: b[1].val, name: text };
  const r = await qlooGet<{ results?: { name: string; entity_id: string }[] }>("/search", { query: text, take: 1 }, stats);
  const e = r.results?.[0];
  if (!e) throw new ToolError(`Qloo found no entity named "${text}".`);
  return { id: e.entity_id, name: e.name };
}

function slim(e: QEntity) {
  const p = e.properties ?? {};
  return {
    name: e.name, kind: e.subtype?.replace("urn:entity:", ""),
    address: p.address ?? undefined, neighbourhood: p.geocode?.neighborhood ?? undefined,
    distance_m: e.query?.distance != null ? Math.round(e.query.distance) : undefined,
    qloo_affinity: e.query?.affinity != null ? r2(e.query.affinity) : undefined,
    rating: p.business_rating ? r2(p.business_rating) : undefined,
    price_level: p.price_level ?? undefined,
    hours: fmtHours(p.hours),
    about: (p.short_description ?? p.description)?.slice(0, 140),
    tags: e.tags?.slice(0, 3).map((t) => t.name),
  };
}

function interestParams(ds: DataSet, dimLabels: string[]): { params: Record<string, string>; used: string[] } {
  const ents: string[] = [], tags: string[] = [], used: string[] = [];
  for (const l of dimLabels) {
    const item = ds.basket.find((b) => norm(b.label) === norm(l));
    const k = item && BASKET_KEYS[item.id];
    if (!item || !k) continue;
    if (k.key === "signal.interests.entities") { if (ents.length < 4) { ents.push(k.val); used.push(item.label); } }
    else if (tags.length < 3) { tags.push(k.val); used.push(item.label); }
  }
  const params: Record<string, string> = {};
  if (ents.length) params["signal.interests.entities"] = ents.join(",");
  if (tags.length) params["signal.interests.tags"] = tags.join(",");
  return { params, used };
}

const local_scene = defineTool({
  name: "local_scene",
  description:
    "LIVE Qloo call. What to actually go to in a neighbourhood: real places (hard-filtered to a radius of the hood centre), plus artists and brands with local affinity (location is only a loose bias for those). Steer by taste: pass `taste_of` (a hood whose top traits the user loves, e.g. Silver Lake when they're moving to Neukolln) and/or explicit `interests` (basket labels). Returns names, addresses, distances and Qloo affinity.",
  schema: z.object({
    hood_id: z.string().describe("where the user wants recommendations"),
    kinds: z.array(z.enum(["place", "artist", "brand"])).optional().describe("default all three"),
    taste_of: z.string().optional().describe("hood id/name whose measured top traits become the taste signal"),
    interests: z.array(z.string()).optional().describe("basket item labels, e.g. ['Vegan restaurants','Radiohead']"),
    radius_m: z.number().min(300).max(5000).optional(),
    take: z.number().int().min(1).max(8).optional(),
    place_type: z.string().optional().describe("restrict places to a Qloo place type, free text, e.g. 'wine bar', 'record store', 'ramen'"),
    max_price_level: z.number().int().min(1).max(4).optional().describe("1 = cheap … 4 = expensive"),
  }),
  live: true,
  async run({ hood_id, kinds, taste_of, interests, radius_m, take, place_type, max_price_level }, { ds, stats }) {
    const h = resolveHood(ds, hood_id);
    let labels = interests ?? [];
    let tasteFrom: string | undefined;
    if (taste_of) {
      const src = resolveHood(ds, taste_of);
      tasteFrom = src.name;
      labels = [...labels, ...src.v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 14).map(([, i]) => label(ds, i))];
    }
    const { params: sig, used } = interestParams(ds, labels);
    const radius = radius_m ?? 1500, n = take ?? 6;
    const ks = kinds?.length ? kinds : (["place", "artist", "brand"] as const);
    const placeTag = place_type ? await qlooResolveTag(place_type, stats) : null;
    const point = `POINT(${h.lon} ${h.lat})`;
    const out: Record<string, unknown> = {};
    await Promise.all(ks.map(async (kind) => {
      const params: Record<string, string | number> = { "filter.type": KIND_TYPE[kind], take: n, ...sig };
      if (kind !== "place") delete params["signal.interests.tags"]; // place tags are meaningless (and break results) for artists/brands
      if (kind === "place") {
        params["filter.location"] = point; params["filter.location.radius"] = radius;
        if (placeTag) params["filter.tags"] = placeTag.id;
        if (max_price_level) params["filter.price_level.max"] = max_price_level;
      }
      else { params["signal.location"] = point; params["signal.location.radius"] = radius; }
      try {
        const r = await qlooGet<{ results?: { entities?: QEntity[] } }>("/v2/insights", params, stats);
        out[kind] = (r.results?.entities ?? []).map(slim);
      } catch (e) { out[kind] = { error: e instanceof Error ? e.message : String(e) }; }
    }));
    const counts = ks.map((kd) => `${Array.isArray(out[kd]) ? (out[kd] as unknown[]).length : 0} ${kd}`).join(", ");
    return {
      data: { where: { hood_id: h.id, name: h.name, radius_m: radius }, place_filter: placeTag ? { type: placeTag.name, max_price_level: max_price_level ?? null } : null, taste_signal: { from_hood: tasteFrom ?? null, interests_sent_to_qloo: used }, note: "place results are radius-filtered; artist/brand results use location as a soft bias only. Taste tags are loosely respected.", ...out },
      summary: `${counts} in ${h.name}${tasteFrom ? ` (taste of ${tasteFrom})` : ""}`,
      uiActions: [{ type: "flyTo", hood: h.id }],
    };
  },
});

const audience = defineTool({
  name: "audience",
  description: "LIVE Qloo call. Demographic skew (age bands and gender) of the audience of an artist, brand, movie, show, etc. Values are Qloo deviations from the baseline population (positive = over-indexes).",
  schema: z.object({ item_label: z.string().describe("e.g. 'Peso Pluma', 'Aesop'") }),
  live: true,
  async run({ item_label }, { stats }) {
    const ent = await resolveEntity(item_label, stats);
    const r = await qlooGet<{ results?: { demographics?: { query: { age?: Record<string, number>; gender?: Record<string, number> } }[] } }>(
      "/v2/insights", { "filter.type": "urn:demographics", "signal.interests.entities": ent.id }, stats);
    const q = r.results?.demographics?.[0]?.query;
    if (!q) throw new ToolError(`Qloo returned no demographics for "${ent.name}".`);
    const age = Object.entries(q.age ?? {}).map(([band, v]) => ({ band, skew: r2(v) })).sort((a, b) => b.skew - a.skew);
    const gender = Object.entries(q.gender ?? {}).map(([g, v]) => ({ gender: g, skew: r2(v) }));
    return { data: { item: ent.name, age_bands_sorted: age, gender }, summary: `${ent.name}: skews ${age[0]?.band} (${age[0]?.skew > 0 ? "+" : ""}${age[0]?.skew}), ${gender.sort((a, b) => b.skew - a.skew)[0]?.gender}` };
  },
});

const cross_domain = defineTool({
  name: "cross_domain",
  description:
    "LIVE Qloo call. Cross-domain taste transfer: what other brands / artists / places / films / books do fans of an item like? e.g. brands for fans of an artist, or places in London for fans of Peso Pluma. Optionally condition on a location (hood id/name, city id/name; places are hard-filtered to the radius, other kinds only softly biased).",
  schema: z.object({
    item_label: z.string(),
    target_kind: z.enum(KINDS),
    location: z.string().optional().describe("hood id/name or city id/name"),
    take: z.number().int().min(1).max(8).optional(),
  }),
  live: true,
  async run({ item_label, target_kind, location, take }, { ds, stats }) {
    const ent = await resolveEntity(item_label, stats);
    const params: Record<string, string | number> = { "filter.type": KIND_TYPE[target_kind], "signal.interests.entities": ent.id, take: take ?? 6 };
    let where: string | null = null, hood: Hood | null = null;
    if (location) {
      let lon: number, lat: number, radius: number;
      const h = ds.hoods.find((x) => x.id === location) ?? findHood(ds, location);
      const c = h ? null : ds.cities.find((x) => x.id === location) ?? ds.cities.find((x) => x.id === findCity(ds, location));
      if (h) { lon = h.lon; lat = h.lat; radius = 2000; where = h.name; hood = h; }
      else if (c) { lon = c.center[0]; lat = c.center[1]; radius = 15000; where = c.name; }
      else throw new ToolError(`Unknown location "${location}".`);
      const pt = `POINT(${lon} ${lat})`;
      if (target_kind === "place") { params["filter.location"] = pt; params["filter.location.radius"] = radius; }
      else { params["signal.location"] = pt; params["signal.location.radius"] = radius; }
    }
    const r = await qlooGet<{ results?: { entities?: QEntity[] } }>("/v2/insights", params, stats);
    const items = (r.results?.entities ?? []).map(slim);
    return {
      data: { fans_of: ent.name, target_kind, location: where, location_filter: location ? (target_kind === "place" ? "hard radius filter" : "soft bias only") : null, results: items },
      summary: `${items.length} ${target_kind} for fans of ${ent.name}${where ? ` near ${where}` : ""}`,
      uiActions: hood ? [{ type: "flyTo", hood: hood.id }] : [],
    };
  },
});

export const TOOLS: ToolDef[] = [list_cities, search_hoods, find_twins, explain_match, taste_profile, where_in_city, pin_twins, local_scene, audience, cross_domain, ...TOOLS_V2];
export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);

export function jsonSchemaOf(t: ToolDef): Record<string, unknown> {
  const s = z.toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

export interface ExecResult { ok: boolean; content: string; summary: string; uiActions: AgentAction[]; qloo: QlooStats }
const MAX_RESULT_CHARS = 9000;

/** Validate args, run a tool, never throw. `content` is what the model sees. */
export async function executeTool(name: string, rawArgs: unknown, ds?: DataSet, progress: (note: string) => void = () => {}): Promise<ExecResult> {
  const stats = newStats();
  const t = toolByName(name);
  if (!t) return { ok: false, content: JSON.stringify({ error: `unknown tool ${name}` }), summary: `unknown tool ${name}`, uiActions: [], qloo: stats };
  const parsed = t.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ");
    return { ok: false, content: JSON.stringify({ error: `invalid arguments: ${msg}` }), summary: `invalid arguments`, uiActions: [], qloo: stats };
  }
  try {
    const out = await t.run(parsed.data, { ds: ds ?? (await loadDataSet()), stats, progress });
    let content = JSON.stringify(out.data);
    if (content.length > MAX_RESULT_CHARS) content = content.slice(0, MAX_RESULT_CHARS) + '..."[truncated]';
    return { ok: true, content, summary: out.summary + (stats.live + stats.cached ? ` [qloo ${stats.live} live${stats.cached ? `, ${stats.cached} cached` : ""}]` : ""), uiActions: out.uiActions ?? [], qloo: stats };
  } catch (e) {
    const msg = e instanceof ToolError || e instanceof QlooError ? e.message : "tool failed";
    return { ok: false, content: JSON.stringify({ error: msg }), summary: msg, uiActions: [], qloo: stats };
  }
}
