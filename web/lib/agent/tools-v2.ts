// Agent v2 tools: any city on Earth, Qloo-native taste tools, and complementary non-taste sources.
// Role split (enforced in descriptions and the system prompt):
//   Qloo        -> every taste judgement: twins, what a place over-indexes on, venue picks, audiences, trends, demand.
//   OSM         -> physical facts only: neighbourhoods and how many venues of a kind physically exist (supply).
//   Nominatim   -> place name -> coordinates.
//   Wikipedia   -> background facts.   Web search -> current facts Qloo lacks (events, news, closures, rents), cited.
import { z } from "zod";
import { busyAt, type Busyness } from "./busy";
import {
  CORE_BASKET, allCities, correctItem, ensureCity, fetchHeat, findCityAny, hoodVec, loadCore, qlooQueryFor,
  type CityMeta, type CoreFile, type CoreHood,
} from "./city-live";
import { cosine, geohashCenter, hav } from "./geo";
import { join } from "node:path";
import { geocode, readJson, webRoot } from "./net";
import { BASKET_KEYS, loadCellsFile, loadDataSet } from "./node-data";
import { osmAround, osmSupplyGrid } from "./osm";
import { GAP_KINDS, OSM_FALLBACK, SUPPLY_KINDS, loadKindCategories, loadSupply, supplyAround, type SupplyKind } from "./supply";
import { fmtHours, qlooCompare, qlooGet, qlooResolveTag, qlooScene, qlooSearchEntity, qlooTrend } from "./qloo";
import { ToolError, defineTool, r2, r3, type ToolDef } from "./tool-kit";
import { REPORT_TOOLS } from "./report";
import { reportSkillTool } from "./skills";
import type { AgentAction, OpportunityCell } from "./types";
import { readPage, webSearch, wikiLookup } from "./web";
import type { DataSet, Hood } from "../types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const CORE_LABEL = new Map(CORE_BASKET.map((c) => [c.id, c.label]));
const coreLabels = (core: CoreFile) => core.items.map((id) => CORE_LABEL.get(id) ?? id);

async function staticDemand(ds: DataSet, city: string, taste: string) {
  const singular = (s: string) => norm(s.replace(/_/g, " ")).split(" ").map((w) => w.replace(/s$/, "")).join(" ");
  const q = singular(taste);
  const item = ds.basket.find((b) => singular(b.label) === q || singular(b.id.replace(/^[a-z]+-/, "").replace(/-/g, " ")) === q);
  const key = item && BASKET_KEYS[item.id];
  if (!item || !key) return null;
  const { cells } = await loadCellsFile(city);
  return { cells, z: Float64Array.from(cells, (c) => c.v[item.i]), present: cells.length, sig: { ...key, name: item.label } };
}

async function twinSource(ds: DataSet, source: string, cities: CityMeta[], ctx?: Pick<ToolCtx, "stats" | "progress">): Promise<{ city: CityMeta; label: string; lat: number; lon: number; hoodId: string | null; v: number[]; staticHood: DataSet["hoods"][number] | null }> {
  const staticHood = ds.hoods.find((h) => h.id === source || norm(h.name) === norm(source));
  for (const city of cities) {
    if (staticHood && city.id !== staticHood.city) continue;
    const core = await loadCore(city.id);
    const hood = core?.hoods.find((h) => h.id === (staticHood?.id ?? source) || norm(h.name) === norm(source));
    if (core && (hood || staticHood)) {
      const h = hood ?? staticHood!;
      const v = hood?.v ?? hoodVec(core.cells, h.lat, h.lon)?.v;
      if (v) return { city, label: h.name, lat: h.lat, lon: h.lon, hoodId: h.id, v, staticHood: staticHood ?? null };
    }
  }
  const g = (await geocode(source, 1).catch((e) => { throw new ToolError(`Could not resolve "${source}": ${e instanceof Error ? e.message : "geocoding failed"}`); }))[0];
  if (!g) throw new ToolError(`Could not resolve "${source}".`);
  for (const city of cities) {
    if (hav(g.lat, g.lon, city.center[1], city.center[0]) > 80_000) continue;
    const core = await loadCore(city.id);
    const v = core && hoodVec(core.cells, g.lat, g.lon)?.v;
    if (v) return { city, label: g.name, lat: g.lat, lon: g.lon, hoodId: null, v, staticHood: null };
  }
  // "Shimokitazawa, Tokyo": the city is named, so build it once (cached) and look again.
  const cityName = source.includes(",") ? source.split(",").pop()!.trim() : "";
  if (ctx && cityName.length > 1 && !(await findCityAny(cityName))) {
    await cityOrThrow(cityName, ctx);
    return twinSource(ds, source, await allCities());
  }
  throw new ToolError(`"${source}" is not inside a fingerprinted city. Call add_city for its city first.`);
}

/** A fingerprinted city by name. With `ctx`, a city that isn't fingerprinted yet is built live first (the user named it). */
async function cityOrThrow(text: string, ctx?: Pick<ToolCtx, "stats" | "progress">): Promise<{ city: CityMeta; core: CoreFile }> {
  let city = await findCityAny(text);
  if (!city && ctx) {
    ctx.progress(`fingerprinting ${text} from qloo (first time only)`);
    city = await ensureCity(text, { stats: ctx.stats, onProgress: (p) => ctx.progress(`${text}: ${p.stage} ${p.done}/${p.total}`) }).catch((e) => {
      throw new ToolError(`Couldn't fingerprint "${text}": ${e instanceof Error ? e.message : "unknown error"}`);
    });
  }
  if (!city) throw new ToolError(`"${text}" has not been fingerprinted yet. Call add_city("${text}") first (≈40 Qloo calls, then cached).`);
  const core = await loadCore(city.id);
  if (!core) throw new ToolError(`No fingerprint data for ${city.name}.`);
  return { city, core };
}

function zs(xs: number[]) {
  const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length || 1)) || 1;
  return xs.map((x) => (x - m) / sd);
}

function nearestCoreHood(core: CoreFile, lat: number, lon: number): { h: CoreHood; m: number } | null {
  let best: { h: CoreHood; m: number } | null = null;
  for (const h of core.hoods) { const m = hav(lat, lon, h.lat, h.lon); if (!best || m < best.m) best = { h, m }; }
  return best;
}

/** Resolve a free-text taste to a Qloo signal: our basket first, then Qloo place tags or entity search. */
async function tasteSignal(text: string, as: "place_type" | "entity", stats: ToolCtx["stats"]): Promise<{ key: string; val: string; name: string }> {
  const n = norm(text);
  const core = CORE_BASKET.find((c) => norm(c.label) === n);
  if (core) return { key: core.key, val: core.val, name: core.label };
  const b = Object.entries(BASKET_KEYS).find(([id]) => norm(id.replace(/^[a-z]+-/, "").replace(/-/g, " ")) === n);
  if (b) return { key: b[1].key, val: b[1].val, name: text };
  if (as === "place_type") {
    const t = await qlooResolveTag(text, stats);
    if (t) return { key: "signal.interests.tags", val: t.id, name: t.name };
  }
  const e = await qlooSearchEntity(text, stats);
  if (!e) throw new ToolError(`Qloo has no entity or place type matching "${text}".`);
  return { key: "signal.interests.entities", val: e.id, name: e.name };
}
type ToolCtx = Parameters<ToolDef["run"]>[1];

const words = (t: string) => new Set(norm(t.replace(/_/g, " ")).split(" ").map((w) => w.replace(/s$/, "")).filter((w) => w.length > 2));
/** Best venue kind sharing words with `t`, scored by how much of the kind (or one of its categories) the text covers; the kind's own name counts double. */
async function overlap(t: string): Promise<SupplyKind | undefined> {
  const cats = await loadKindCategories(), tw = words(t);
  const hits = (x: string) => { const xw = [...words(x)]; return xw.length ? xw.filter((w) => tw.has(w)).length / xw.length : 0; };
  return SUPPLY_KINDS.map((k) => ({ k, n: 2 * hits(k) + Math.max(0, ...(cats[k] ?? []).map(hits)), width: (cats[k] ?? []).length }))
    .filter((x) => x.n).sort((a, b) => b.n - a.n || a.width - b.width)[0]?.k;
}
/**
 * The Overture venue kind for free text: an exact kind, a kind or Overture category sharing a word with the text
 * ("specialty coffee" -> coffee_shop -> cafe), or one sharing a word with the Qloo place type the text resolves to.
 */
export async function supplyKindFor(text: string, stats?: ToolCtx["stats"]): Promise<SupplyKind | null> {
  if ((SUPPLY_KINDS as readonly string[]).includes(text)) return text as SupplyKind;
  const direct = await overlap(text);
  if (direct || !stats) return direct ?? null;
  const tag = await qlooResolveTag(text, stats).catch(() => null);
  return tag ? (await overlap(tag.name)) ?? (await overlap(tag.id.split(":").pop() ?? "")) ?? null : null;
}

/**
 * Where a taste concentrates in any fingerprinted city: live Qloo heatmap for the taste (a place type / tag when it reads
 * like one, else an entity), popularity-corrected against the city's cells, rolled up to neighbourhoods.
 */
export async function liveWhere(cityText: string, taste: string, k: number, ctx: Pick<ToolCtx, "stats" | "progress">) {
  const { city, core } = await cityOrThrow(cityText, ctx);
  const saved = city.source === "static" ? await staticDemand(await loadDataSet(), city.id, taste) : null;
  const where = saved ? "" : await qlooQueryFor(city.id);
  let sig = saved?.sig ?? await tasteSignal(taste, "place_type", ctx.stats).catch(() => tasteSignal(taste, "entity", ctx.stats));
  if (!saved) ctx.progress(`qloo heatmap for ${sig.name} in ${city.name}`);
  let heat = saved ? null : await fetchHeat(where, sig.key, sig.val, ctx.stats);
  let { z, present } = saved ?? correctItem(core, heat!);
  if (present < 50 && !saved) {
    const kind = await supplyKindFor(taste, ctx.stats);
    const broad = kind ? await qlooResolveTag(kind.replace(/_/g, " "), ctx.stats) : null;
    if (broad && broad.id !== sig.val) {
      ctx.progress(`"${sig.name}" is thin in Qloo; using ${broad.name}`);
      sig = { key: "signal.interests.tags", val: broad.id, name: broad.name };
      heat = await fetchHeat(where, sig.key, sig.val, ctx.stats);
      ({ z, present } = correctItem(core, heat));
    }
  }
  if (present < 20) throw new ToolError(`Qloo has too little data for "${sig.name}" in ${city.name}.`);
  const cells = saved?.cells ?? core.cells;
  const idx = cells.map((_, i) => i).filter((i) => saved || heat!.has(cells[i].g)).sort((a, b) => z[b] - z[a]);
  const top_cells = idx.slice(0, k).map((i) => { const c = cells[i]; return { lat: c.lat, lon: c.lon, near: nearestCoreHood(core, c.lat, c.lon)?.h.name, corrected_z: r2(z[i]) }; });
  const hoods = new Map<string, { n: number; h: CoreHood }>();
  for (const i of idx.slice(0, 30)) { const n = nearestCoreHood(core, cells[i].lat, cells[i].lon); if (n && n.m < 2500) hoods.set(n.h.id, { n: (hoods.get(n.h.id)?.n ?? 0) + 1, h: n.h }); }
  const top_hoods = [...hoods.values()].sort((a, b) => b.n - a.n).slice(0, k).map(({ n, h }) => ({ hood_id: h.id, name: h.name, lat: h.lat, lon: h.lon, cells_in_top30: n }));
  return { city, sig, present, top_hoods, top_cells, source: saved ? "precomputed Qloo heatmaps, popularity-corrected" : "live Qloo heatmap, popularity-corrected against this city's cells" };
}

// ───────────── geography ─────────────
const add_city = defineTool({
  name: "add_city",
  description: "Fingerprint ANY city on Earth live from Qloo (≈40 heatmaps on the core basket, our popularity correction, neighbourhoods from OpenStreetMap). Cached forever after the first build. Use before twins_anywhere/opportunity/tour on a city that isn't available yet. Reports coverage honestly; fails if Qloo has too little data.",
  schema: z.object({ name: z.string().min(2).describe("city name, e.g. 'Lisbon' or 'Austin, Texas'") }),
  live: true,
  async run({ name }, { stats, progress }) {
    const city = await ensureCity(name, { stats, onProgress: (p) => progress(`${p.stage} ${p.done}/${p.total} · ${p.note}`) });
    return {
      data: { city: { id: city.id, name: city.name, country: city.country, cells: city.cellCount, neighbourhoods: city.hoodCount, source: city.source, dims: city.dims, coverage: city.coverage } },
      summary: `${city.name}: ${city.cellCount} cells, ${city.hoodCount} neighbourhoods (${city.source})`,
      uiActions: city.source === "live" ? [{ type: "addCity", city }] : [],
    };
  },
});

const geocode_tool = defineTool({
  name: "geocode",
  description: "OpenStreetMap Nominatim: turn a place name or address into coordinates and a bounding box. Facts only — no taste.",
  schema: z.object({ query: z.string().min(2) }),
  async run({ query }) {
    const hits = await geocode(query, 3);
    if (!hits.length) throw new ToolError(`Nominatim found nothing for "${query}".`);
    return { data: { results: hits }, summary: `${hits[0].display.slice(0, 80)}` };
  },
});

const twins_anywhere = defineTool({
  name: "twins_anywhere",
  description: "Cultural twins between ANY two fingerprinted cities (the 6 built-in ones or any added with add_city), compared on the 40-dim core basket. `source` can be a neighbourhood id or name, or any place/address (geocoded and matched to the 1 km taste cells around it).",
  schema: z.object({
    source: z.string().describe("neighbourhood id/name, or any place or address"),
    target_city: z.string(),
    k: z.number().int().min(1).max(10).optional(),
  }),
  async run({ source, target_city, k }, { ds, stats, progress }) {
    const tgt = await cityOrThrow(target_city, { stats, progress });
    const src = await twinSource(ds, source, await allCities(), { stats, progress });
    const { v: srcVec, label: srcName, city: srcCity, hoodId: srcHoodId } = src;
    if (srcCity.id === tgt.city.id) throw new ToolError("Source and target are in the same city.");
    const labels = coreLabels(tgt.core);
    const ranked = tgt.core.hoods.map((h) => ({ h, s: cosine(srcVec!, h.v) })).sort((a, b) => b.s - a.s);
    const top = ranked.slice(0, k ?? 5).map(({ h, s }, i) => {
      const dims = h.v.map((x, d) => ({ d, a: srcVec![d], b: x }));
      return {
        rank: i + 1, hood_id: h.id, name: h.name, cosine: r3(s), lat: h.lat, lon: h.lon,
        shared: dims.filter((x) => x.a > 0 && x.b > 0).sort((p, q) => Math.min(q.a, q.b) - Math.min(p.a, p.b)).slice(0, 5).map((x) => labels[x.d]),
        different: dims.sort((p, q) => Math.abs(q.a - q.b) - Math.abs(p.a - p.b)).slice(0, 3).map((x) => `${labels[x.d]} (${r2(x.a)} vs ${r2(x.b)})`),
      };
    });
    const ui: AgentAction[] = [];
    const staticPair = ds.cities.some((c) => c.id === tgt.city.id) && srcHoodId && ds.hoods.some((h) => h.id === srcHoodId);
    if (staticPair) ui.push({ type: "showTwins", from: srcHoodId!, to: tgt.city.id, twin: top[0]?.hood_id });
    else if (tgt.city.source === "live") ui.push({ type: "addCity", city: tgt.city });
    return {
      data: { source: { name: srcName, city: srcCity?.name }, target_city: tgt.city.name, dims: "40-dim core basket", twins: top, coverage: tgt.city.coverage ?? null },
      summary: `${srcName} → ${tgt.city.name}: ${top[0]?.name} ${top[0]?.cosine}`,
      uiActions: ui,
    };
  },
});

const gap_scan = defineTool({
  name: "gap_scan",
  description: "Cross-city gaps: find a neighbourhood's strongest foreign twins, compare same-radius venue shares from Overture, and return kinds recurring in the twins but scarce at home. Uses saved taste fingerprints and supply; no live Qloo calls. Home accepts a neighbourhood id/name or any place/address. Generic bar and restaurant rollups are excluded to avoid double-counting.",
  schema: z.object({
    home: z.string().min(2),
    cities: z.array(z.string()).min(1).optional().describe("target fingerprinted cities; default every other fingerprinted city"),
    twins: z.number().int().min(1).max(5).default(3),
    radius_m: z.number().min(600).max(1500).default(1000),
  }),
  async run({ home, cities: asked, twins: count, radius_m }, { ds }) {
    const cities = await allCities();
    const src = await twinSource(ds, home, cities);
    const targets = asked ? await Promise.all(asked.map(async (text) => (await cityOrThrow(text)).city)) : cities;
    const foreign = [...new Map(targets.filter((c) => c.id !== src.city.id).map((c) => [c.id, c])).values()];
    if (!foreign.length) throw new ToolError("Choose at least one fingerprinted city other than the home's city.");
    const ranked = [];
    for (const city of foreign) {
      if (src.staticHood && city.source === "static") {
        const pre = ds.twins[src.staticHood.id]?.[city.id];
        if (pre?.length) {
          for (const match of pre) {
            const h = ds.hoods.find((h) => h.id === match.hood);
            if (h) ranked.push({ h, city, score: match.score });
          }
        } else {
          for (const h of ds.hoods.filter((h) => h.city === city.id)) ranked.push({ h, city, score: cosine(src.staticHood.v, h.v) });
        }
      } else {
        const core = await loadCore(city.id);
        if (!core) throw new ToolError(`No fingerprint data for ${city.name}.`);
        for (const h of core.hoods) ranked.push({ h, city, score: cosine(src.v, h.v) });
      }
    }
    const twins = ranked.sort((a, b) => b.score - a.score).slice(0, count);
    if (!twins.length) throw new ToolError("No foreign twins found in the selected fingerprinted cities.");
    const places = [{ label: src.label, city: src.city, lat: src.lat, lon: src.lon }, ...twins.map(({ h, city }) => ({ label: h.name, city, lat: h.lat, lon: h.lon }))];
    const supplies = await Promise.all(places.map(async (place) => {
      const supply = await loadSupply(place.city.id);
      if (!supply || !Object.keys(supply.cells).length) throw new ToolError(`No Overture venue supply data for ${place.city.name}; gap_scan needs supply for home and every twin.`);
      const missing = GAP_KINDS.filter((k) => !supply.kinds.includes(k));
      if (missing.length) throw new ToolError(`Incomplete venue supply data for ${place.city.name}: missing ${missing.join(", ")}.`);
      const result = supplyAround(supply, place.lat, place.lon, radius_m, GAP_KINDS);
      const total = Object.values(result.counts).reduce((sum, n) => sum + n, 0);
      if (!result.cells || !total) throw new ToolError(`No counted venue supply near ${place.label} in ${place.city.name} within this radius; shares cannot be compared.`);
      return { ...result, total, source: `${supply.source} ${supply.release}` };
    }));
    const rows = GAP_KINDS.map((kind) => {
      const home_count = supplies[0].counts[kind], twin_counts = supplies.slice(1).map((s) => s.counts[kind]);
      const homeShare = home_count / supplies[0].total;
      const shares = supplies.slice(1).map((s) => s.counts[kind] / s.total);
      const meanShare = shares.reduce((sum, n) => sum + n, 0) / shares.length;
      return {
        kind, home_count, twin_counts, home_share_pct: r2(homeShare * 100), twin_shares_pct: shares.map((s) => r2(s * 100)), twin_mean_share_pct: r2(meanShare * 100),
        lift: homeShare ? r2(meanShare / homeShare) : null,
        support: shares.filter((share, i) => twin_counts[i] >= 3 && share >= 1.5 * homeShare).length,
        scarce: home_count <= 1 || homeShare < meanShare / 2,
      };
    });
    const display = ({ kind, home_count, twin_counts, home_share_pct, twin_shares_pct, twin_mean_share_pct, lift }: typeof rows[number]) => ({ kind, home_count, twin_counts, home_share_pct, twin_shares_pct, twin_mean_share_pct, lift });
    const gaps = rows.filter((r) => r.support >= Math.ceil(twins.length * 2 / 3) && r.scarce)
      .sort((a, b) => (a.lift === b.lift ? b.twin_mean_share_pct - a.twin_mean_share_pct : a.lift === null ? -1 : b.lift === null ? 1 : b.lift - a.lift)).map(display);
    const present_everywhere = rows.filter((r) => r.home_count > 0 && r.twin_counts.every((n) => n > 0)).sort((a, b) => b.home_count - a.home_count).map(display);
    return {
      data: {
        home: { label: src.label, city: src.city.name, link: src.hoodId ? `hood:${src.hoodId}` : `geo:${src.lat},${src.lon}`, busy: await busyAt(src.city.id, src.lat, src.lon), total_counted: supplies[0].total },
        twins: twins.map(({ h, city, score }, i) => ({ label: h.name, city: city.name, match_pct: Math.round(score * 100), link: `hood:${h.id}`, total_counted: supplies[i + 1].total })),
        radius_m, kinds_counted: GAP_KINDS, supply_sources: [...new Set(supplies.map((s) => s.source))], gaps, present_everywhere,
        note: "Shares use all counted kinds except overlapping bar and restaurant rollups. Twin counts and shares follow twins order. Counts sum map cells whose centres are inside the radius and are lower bounds. Lift is null when home share is zero; these gaps sort first. Presence does not prove demand or business survival.",
      },
      summary: `${gaps.length} recurring venue gaps near ${src.label} across ${twins.length} foreign twins`,
      uiActions: src.hoodId ? [{ type: "focusHood", hood: src.hoodId, label: src.label }] : [{ type: "focus", lat: src.lat, lon: src.lon, label: src.label }],
    };
  },
});

// ───────────── Qloo-native taste ─────────────
const scene = defineTool({
  name: "scene",
  description: "LIVE Qloo. What a neighbourhood or city over-indexes on, straight from Qloo's location insights: place types (tags), audiences, artists and brands. Use for 'what's the vibe of X' / 'what is X known for'.",
  schema: z.object({ place: z.string().describe("e.g. 'Neukölln, Berlin' or 'Shimokitazawa, Tokyo'") }),
  live: true,
  async run({ place }, { stats }) {
    const s = await qlooScene(place, stats);
    if (!s.tags.length && !s.artists.length && !s.brands.length) throw new ToolError(`Qloo returned no location insights for "${place}".`);
    return { data: { place, place_types: s.tags.map((t) => t.name), audiences: s.audiences, artists: s.artists, brands: s.brands }, summary: `${s.tags.length} place types, ${s.artists.length} artists, ${s.brands.length} brands for ${place}` };
  },
});

function topEntities(vec: ArrayLike<number>, keys: { key: string; val: string; label: string }[], n = 5) {
  return keys.map((k, i) => ({ ...k, z: vec[i] })).filter((x) => x.key === "signal.interests.entities" && x.z > 0).sort((a, b) => b.z - a.z).slice(0, n);
}
async function hoodEntities(ref: string, ds: DataSet): Promise<{ name: string; ents: { val: string; label: string }[] }> {
  const sh: Hood | undefined = ds.hoods.find((h) => h.id === ref || norm(h.name) === norm(ref));
  if (sh) {
    const keys = ds.basket.map((b) => ({ key: BASKET_KEYS[b.id]?.key ?? "", val: BASKET_KEYS[b.id]?.val ?? "", label: b.label }));
    return { name: sh.name, ents: topEntities(sh.v, keys) };
  }
  for (const c of await allCities()) {
    const core = await loadCore(c.id);
    const h = core?.hoods.find((x) => x.id === ref || norm(x.name) === norm(ref));
    if (h && core) {
      const keys = core.items.map((id) => { const it = CORE_BASKET.find((x) => x.id === id)!; return { key: it.key, val: it.val, label: it.label }; });
      return { name: h.name, ents: topEntities(h.v, keys) };
    }
  }
  throw new ToolError(`Unknown neighbourhood "${ref}".`);
}

const compare_taste = defineTool({
  name: "compare_taste",
  description: "LIVE Qloo /insights/compare: Qloo's own list of characteristics two tastes share. Pass two neighbourhoods (ids/names — their strongest artists/brands become the signal) or two comma-separated lists of artists/brands.",
  schema: z.object({ a: z.string(), b: z.string() }),
  live: true,
  async run({ a, b }, { ds, stats }) {
    const side = async (x: string) => {
      try { return await hoodEntities(x, ds); } catch {
        const ids = (await Promise.all(x.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5).map((t) => qlooSearchEntity(t, stats)))).filter(Boolean) as { id: string; name: string }[];
        return { name: x, ents: ids.map((e) => ({ val: e.id, label: e.name })) };
      }
    };
    const [A, B] = await Promise.all([side(a), side(b)]);
    if (!A.ents.length || !B.ents.length) throw new ToolError("Need at least one artist/brand signal on each side.");
    const shared = await qlooCompare(A.ents.map((e) => e.val), B.ents.map((e) => e.val), stats, 12);
    return { data: { a: { name: A.name, signal: A.ents.map((e) => e.label) }, b: { name: B.name, signal: B.ents.map((e) => e.label) }, shared_characteristics: shared }, summary: `${shared.length} shared characteristics (${A.name} vs ${B.name})` };
  },
});

const TREND_TYPES = ["urn:entity:artist", "urn:entity:brand", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:podcast", "urn:entity:book", "urn:entity:videogame", "urn:entity:actor", "urn:entity:person"];
const trend = defineTool({
  name: "trend",
  description: "LIVE Qloo trending: is an artist/brand/film rising or fading? Weekly population percentile over the last N months.",
  schema: z.object({ item: z.string(), months: z.number().int().min(1).max(12).optional() }),
  live: true,
  async run({ item, months }, { stats }) {
    const e = await qlooSearchEntity(item, stats);
    if (!e) throw new ToolError(`Qloo found no entity "${item}".`);
    const type = e.types.find((t) => TREND_TYPES.includes(t));
    if (!type) return {
      data: { item, trackable: false, note: `Qloo trends cover artists, brands, films, shows, books, podcasts and people. "${item}" is a place or taste, so use where_in_city or opportunity for where it's strong instead.` },
      summary: `${item}: not trackable over time (Qloo trends cover artists, brands and media)`,
    };
    const pts = await qlooTrend(e.id, type, months ?? 6, stats);
    if (!pts.length) throw new ToolError(`No trend data for ${e.name}.`);
    const first = pts[0], last = pts[pts.length - 1], d = r2(last.percentile - first.percentile);
    return {
      data: { item: e.name, type: type.replace("urn:entity:", ""), from: first, to: last, change_in_percentile: d, direction: Math.abs(d) < 0.02 ? "flat" : d > 0 ? "rising" : "fading", points: pts.slice(-12) },
      summary: `${e.name}: ${Math.abs(d) < 0.02 ? "flat" : d > 0 ? "rising" : "fading"} (${r2(first.percentile)} → ${r2(last.percentile)} percentile)`,
    };
  },
});

// ───────────── demand vs supply ─────────────
const opportunity = defineTool({
  name: "opportunity",
  description: "Where to open something: first screen for active or busy blocks, then rank Qloo taste demand against existing venues from Overture Maps Places. Saved heatmaps for built-in tastes/cities, live Qloo for other tastes. High score = strong taste demand and few existing venues. Quiet blocks are kept only when fewer than three active/busy candidates remain. Paints the map.",
  schema: z.object({
    city: z.string(),
    taste: z.string().describe("what people should love, e.g. 'wine bar', 'natural wine', 'Peggy Gou', 'ramen'"),
    taste_is: z.enum(["place_type", "entity"]).optional().describe("place_type (default) for venue genres/cuisines, entity for an artist/brand"),
    supply_kind: z.string().optional().describe(`venue kind to count as existing supply, one of: ${SUPPLY_KINDS.join(", ")}. Inferred from the taste if omitted.`),
  }),
  live: true,
  async run({ city, taste, taste_is, supply_kind: kindText }, { ds, stats, progress }) {
    // An artist's or brand's fans need somewhere to go: music venues unless the model says otherwise.
    const supply_kind = (kindText && (await supplyKindFor(kindText, stats))) || (await supplyKindFor(taste, stats)) || (taste_is === "entity" ? "music_venue" : null);
    if (!supply_kind) throw new ToolError(`No venue kind in the supply data matches "${kindText || taste}". Pass supply_kind, one of: ${SUPPLY_KINDS.join(", ")}.`);
    const { city: c, core } = await cityOrThrow(city, { stats, progress });
    const saved = c.source === "static" ? await staticDemand(ds, c.id, taste) : null;
    if (!saved) progress(`qloo demand for ${taste} in ${c.name}`);
    const where = saved ? "" : await qlooQueryFor(c.id);
    let sig = saved?.sig ?? await tasteSignal(taste, taste_is ?? "place_type", stats);
    let heat = saved ? null : await fetchHeat(where, sig.key, sig.val, stats);
    let { z: dz, present } = saved ?? correctItem(core, heat!);
    if (present < 50 && !saved && (taste_is ?? "place_type") === "place_type") {
      // niche tag (e.g. "natural wine") -> fall back to the venue type itself as the Qloo demand signal
      const broad = await qlooResolveTag(supply_kind.replace(/_/g, " "), stats);
      if (broad && broad.id !== sig.val) {
        progress(`"${sig.name}" is thin in Qloo; using ${broad.name} demand instead`);
        sig = { key: "signal.interests.tags", val: broad.id, name: broad.name };
        heat = await fetchHeat(where, sig.key, sig.val, stats);
        ({ z: dz, present } = correctItem(core, heat));
      }
    }
    if (present < 50) throw new ToolError(`Qloo has too little demand data for "${sig.name}" in ${c.name} (${present} cells).`);
    const pre = await loadSupply(c.id);
    let supplyOf: (g: string, lat: number, lon: number) => number | null, supplySource: string;
    if (pre) {
      const ki = pre.kinds.indexOf(supply_kind);
      if (ki < 0) throw new ToolError(`No ${supply_kind} supply counts for ${c.name}.`);
      supplyOf = (g) => pre.cells[g]?.[ki] ?? 0;
      supplySource = `${pre.source} ${pre.release}`;
    } else {
      progress(`no precomputed supply for ${c.name}; asking OpenStreetMap`);
      const lats = core.cells.map((x) => x.lat).sort((a, b) => a - b), lons = core.cells.map((x) => x.lon).sort((a, b) => a - b);
      const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
      const bbox: [number, number, number, number] = [q(lats, 0.03), q(lons, 0.03), q(lats, 0.97), q(lons, 0.97)];
      const grid = await osmSupplyGrid(bbox, OSM_FALLBACK[supply_kind as SupplyKind], (d, t) => progress(`openstreetmap tiles ${d}/${t}`));
      supplyOf = (g, lat, lon) => {
        const r = Math.floor((lat - grid.s) / grid.step), col = Math.floor((lon - grid.w) / grid.step);
        return r >= 0 && r < grid.rows && col >= 0 && col < grid.cols && grid.tilesOk[r * grid.cols + col] ? grid.counts.get(g) ?? 0 : null;
      };
      supplySource = "OpenStreetMap (live)";
    }
    const rows = (saved?.cells ?? core.cells).map((cell, i) => ({ cell, demand: dz[i], supply: supplyOf(cell.g, cell.lat, cell.lon) }))
      .filter((x): x is { cell: typeof x.cell; demand: number; supply: number } => x.supply !== null && (!!saved || heat!.has(x.cell.g)));
    if (rows.length < 30) throw new ToolError("Venue supply data is unavailable for most of the city right now. Try again shortly.");
    const sz = zs(rows.map((x) => Math.log1p(x.supply)));
    // Scene fit: one block can spike on anything (a mall, a station), so its demand is blended with the blocks within
    // 1.3 km. A gap only counts where the surrounding area leans into the taste too.
    const kmLon = 111.32 * Math.cos((rows[0].cell.lat * Math.PI) / 180);
    const area = rows.map((x) => {
      let sum = 0, n = 0;
      for (const y of rows) { const dx = (y.cell.lon - x.cell.lon) * kmLon, dy = (y.cell.lat - x.cell.lat) * 111.32; if (dx * dx + dy * dy <= 1.69) { sum += y.demand; n++; } }
      return n ? sum / n : x.demand;
    });
    const cells: (OpportunityCell & { busy_pct: number; busy_tier: Busyness["tier"]; area_demand: number })[] = await Promise.all(rows.map(async (x, i) => {
      const busy = await busyAt(c.id, x.cell.lat, x.cell.lon);
      return { g: x.cell.g, lon: x.cell.lon, lat: x.cell.lat, demand: r2(x.demand), area_demand: r2(area[i]), supply: x.supply, score: r2((x.demand + area[i]) / 2 - sz[i]), busy_pct: busy.pct, busy_tier: busy.tier };
    }));
    const candidates = cells.filter((x) => x.demand > 0.5 && x.area_demand > 0.2);
    const active = candidates.filter((x) => x.busy_tier !== "quiet");
    // at most two blocks per neighbourhood, so the shortlist offers real alternatives
    const perHood = new Map<string, number>();
    const best = (active.length >= 3 ? active : candidates).sort((a, b) => b.score - a.score)
      .map((x) => ({ ...x, near: nearestCoreHood(core, x.lat, x.lon)?.h.name }))
      .filter((x) => { const k = x.near ?? x.g, n = perHood.get(k) ?? 0; perHood.set(k, n + 1); return n < 2; })
      .slice(0, 10);
    const totalSupply = rows.reduce((s, x) => s + x.supply, 0);
    return {
      data: { city: c.name, taste: sig.name, demand_source: saved ? "precomputed Qloo heatmaps, popularity-corrected" : "live Qloo heatmap, popularity-corrected", supply_kind, supply_source: supplySource, cells_scored: rows.length, venues_counted: totalSupply, top_opportunities: best, ranking: "busy enough → the block and the area around it want this taste → fewest existing venues", how: "score = mean(block demand z, demand z of blocks within 1.3 km) − z(log(1 + venue count)); blocks whose surrounding area doesn't lean into the taste are left out; open map data misses some venues, treat supply as a lower bound" },
      summary: `${best.length} gaps for ${sig.name} in ${c.name} (${totalSupply} existing ${supply_kind} counted)`,
      uiActions: [{ type: "opportunity", city: c.id, kind: supply_kind, taste: sig.name, cells }],
    };
  },
});

const tour = defineTool({
  name: "tour",
  description: "Tour planning for an artist across cities: Qloo corrected affinity per 1 km cell in each city (where the fans actually are), the strongest neighbourhoods, and Qloo live-music venues near them. Cities must be fingerprinted (built-in or add_city).",
  schema: z.object({ artist: z.string(), cities: z.array(z.string()).min(1).max(6).optional().describe("default: every fingerprinted city (up to 6)") }),
  live: true,
  async run({ artist, cities: asked }, { stats, progress }) {
    const cities = asked?.length ? asked : (await allCities()).slice(0, 6).map((c) => c.id);
    const sig = await tasteSignal(artist, "entity", stats);
    const venueTag = await qlooResolveTag("live music venue", stats);
    const out: unknown[] = [];
    for (const name of cities) {
      try {
        const { city, core } = await cityOrThrow(name, { stats, progress });
        progress(`${sig.name} in ${city.name}`);
        const heat = await fetchHeat(await qlooQueryFor(city.id), sig.key, sig.val, stats);
        const { z: zz, present, reach, aff } = correctItem(core, heat);
        const idx = core.cells.map((_, i) => i).filter((i) => heat.has(core.cells[i].g)).sort((a, b) => zz[b] - zz[a]).slice(0, 25);
        const hoods = new Map<string, number>();
        for (const i of idx) { const n = nearestCoreHood(core, core.cells[i].lat, core.cells[i].lon); if (n && n.m < 2500) hoods.set(n.h.name, (hoods.get(n.h.name) ?? 0) + 1); }
        const topHoods = [...hoods].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
        const best = core.hoods.find((h) => h.name === topHoods[0]);
        let venues: unknown[] = [];
        if (best && venueTag) {
          const r = await qlooGet<{ results?: { entities?: { name: string; properties?: { address?: string; hours?: unknown }; query?: { affinity?: number; distance?: number } }[] } }>("/v2/insights", {
            "filter.type": "urn:entity:place", "filter.tags": venueTag.id, "filter.location": `POINT(${best.lon} ${best.lat})`, "filter.location.radius": 3000, [sig.key]: sig.val, take: 4,
          }, stats).catch(() => ({ results: { entities: [] } }));
          venues = (r.results?.entities ?? []).map((e) => ({ name: e.name, address: e.properties?.address, hours: fmtHours(e.properties?.hours), qloo_affinity: e.query?.affinity != null ? r2(e.query.affinity) : undefined }));
        }
        const meanAff = idx.length ? idx.reduce((s, i) => s + aff[i], 0) / idx.length : 0;
        out.push({ city: city.name, fan_signal_cells: present, reach: r2(reach), top_cell_affinity: r2(meanAff), strongest_neighbourhoods: topHoods, venues_near_strongest: venues });
      } catch (e) {
        out.push({ city: name, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const ranked = (out as { reach?: number; top_cell_affinity?: number }[]).slice().sort((a, b) => (b.reach ?? -1) * (b.top_cell_affinity ?? 0) - (a.reach ?? -1) * (a.top_cell_affinity ?? 0));
    return { data: { artist: sig.name, cities: ranked, note: "reach = share of the city's cells where Qloo sees fans; neighbourhoods come from the corrected (popularity-removed) map" }, summary: `${sig.name} across ${cities.length} cities` };
  },
});

// ───────────── complementary facts ─────────────
const web_search = defineTool({
  name: "web_search",
  description: "Web search for CURRENT facts Qloo doesn't have: events this week, news, closures, rents, opening announcements. Never use it to pick taste-based recommendations (that's Qloo). Always cite the URLs you use.",
  schema: z.object({ query: z.string().min(3), k: z.number().int().min(1).max(8).optional() }),
  async run({ query, k }) {
    const r = await webSearch(query, k ?? 5);
    return { data: r, summary: `${r.results.length} results (${r.provider})` };
  },
});

const read_page = defineTool({
  name: "read_page",
  description: "Read a web page as text (first ~6k chars) to check a fact from web_search. Cite the URL.",
  schema: z.object({ url: z.string().url() }),
  async run({ url }) {
    const r = await readPage(url);
    return { data: r, summary: `read ${new URL(url).host}${r.truncated ? " (truncated)" : ""}` };
  },
});

const wiki = defineTool({
  name: "wiki",
  description: "Wikipedia/Wikidata background for a place: summary, coordinates, population. Facts only.",
  schema: z.object({ place: z.string().min(2) }),
  async run({ place }) {
    const w = await wikiLookup(place);
    return { data: w, summary: `${w.title}${w.population ? ` · pop ${w.population.value.toLocaleString("en")}` : ""}` };
  },
});

const venue_supply = defineTool({
  name: "venue_supply",
  description: "Physical reality check: how many venues of each kind EXIST around a place (Overture Maps Places, precomputed per city; live OpenStreetMap for other cities). Counts only — use Qloo (local_scene) to pick where to go.",
  schema: z.object({
    place: z.string().optional().describe("place name/address (geocoded) — or pass lat/lon"),
    lat: z.number().optional(), lon: z.number().optional(),
    radius_m: z.number().min(300).max(3000).optional(),
    kinds: z.array(z.string()).max(6).optional().describe(`any of: ${SUPPLY_KINDS.join(", ")}. Omit to get the most common kinds there.`),
  }),
  async run({ place, lat, lon, radius_m, kinds: asked }, { stats }) {
    const mapped = asked?.length ? (await Promise.all(asked.map((k) => supplyKindFor(k, stats)))).filter((k): k is SupplyKind => !!k) : [];
    const all = !mapped.length;
    const kinds = all ? [...SUPPLY_KINDS] : [...new Set(mapped)];
    let la = lat, lo = lon, where = place ?? `${lat},${lon}`;
    if (la == null || lo == null) {
      if (!place) throw new ToolError("Pass a place or lat/lon.");
      const g = (await geocode(place, 1))[0];
      if (!g) throw new ToolError(`Could not place "${place}".`);
      la = g.lat; lo = g.lon; where = g.display;
    }
    const radius = radius_m ?? 1000;
    const city = (await allCities()).find((c) => hav(la!, lo!, c.center[1], c.center[0]) < 80_000);
    const pre = city ? await loadSupply(city.id) : null;
    if (pre) {
      const r = supplyAround(pre, la, lo, Math.max(radius, 700), kinds);
      const shown = all ? kinds.filter((k) => r.counts[k] > 0).sort((a, b) => r.counts[b] - r.counts[a]).slice(0, 8) : kinds;
      const counts = Object.fromEntries(shown.map((k) => [k, r.counts[k]]));
      return { data: { where, radius_m: radius, source: `${pre.source} ${pre.release}`, counts, cells: r.cells, busy: await busyAt(city!.id, la, lo), note: "counts are a lower bound" }, summary: shown.map((k) => `${r.counts[k]} ${k}`).join(", ") || "no venues counted" };
    }
    const rows = await osmAround(la, lo, radius, kinds.slice(0, 6).map((k) => OSM_FALLBACK[k]));
    const busy = city ? await busyAt(city.id, la, lo).catch(() => null) : null;
    return { data: { where, radius_m: radius, source: "OpenStreetMap (live)", kinds: rows, busy }, summary: rows.map((r) => `${r.count} ${r.kind}`).join(", ") };
  },
});


// ───────────── location intelligence: chains, lookalikes, one site ─────────────
interface BrandIndex { city: string; source: string; brands: Record<string, { cat: string; class: "taste" | "convenience" | "other"; g: Record<string, number> }> }
const brandMem = new Map<string, Promise<BrandIndex | null>>();
const loadBrands = (city: string) => {
  let p = brandMem.get(city);
  if (!p) { p = readJson<BrandIndex>(join(webRoot(), "public", "data", "brands", `${city}.json`)); brandMem.set(city, p); }
  return p as Promise<BrandIndex | null>;
};
/** Chain name → the city's index entry: exact, then the closest name that contains it or that it contains. */
function findBrand(idx: BrandIndex, text: string) {
  const q = norm(text), names = Object.keys(idx.brands);
  const exact = names.find((n) => norm(n) === q);
  const fuzzy = exact ?? names.filter((n) => norm(n).includes(q) || q.includes(norm(n))).sort((a, b) => Object.keys(idx.brands[b].g).length - Object.keys(idx.brands[a].g).length)[0];
  return fuzzy ? { name: fuzzy, ...idx.brands[fuzzy] } : null;
}
let backtestMem: Promise<{ brands: [string, string, string, number, number, number][] } | null> | null = null;
/** The brand's own pre-registered backtest result, when it was one of the tested chains. */
async function brandEvidence(name: string) {
  backtestMem ??= readJson(join(webRoot(), "public", "data", "backtest.json"));
  const row = (await backtestMem)?.brands.find((b) => b[0] === name.toLowerCase());
  return row ? { class: row[1], cities_tested: row[3], taste_auc_within_equally_busy_blocks: row[4], busyness_auc: row[5] } : null;
}

/** Weighted mean fingerprint of some cells. */
function meanVec(cells: { v: number[]; w: number }[]) {
  const dim = cells[0]?.v.length ?? 0, tot = cells.reduce((s, c) => s + c.w, 0) || 1;
  return Array.from({ length: dim }, (_, i) => cells.reduce((s, c) => s + c.v[i] * c.w, 0) / tot);
}

/**
 * Rank a city's blocks by taste likeness to a fingerprint, busy blocks first (the backtest: chains follow footfall,
 * taste decides which busy blocks fit). Blocks within `gapM` of an existing site are left out; two per neighbourhood.
 */
async function rankLookalikes(city: CityMeta, core: CoreFile, fp: number[], k: number, avoid: { lat: number; lon: number }[], gapM = 1000) {
  const scored = core.cells.filter((c) => !avoid.some((a) => hav(a.lat, a.lon, c.lat, c.lon) < gapM)).map((c) => ({ c, match: cosine(fp, c.v) }));
  scored.sort((a, b) => b.match - a.match);
  const out: { lat: number; lon: number; g: string; match_pct: number; busy_pct: number; busy_tier: Busyness["tier"]; near?: string; link: string }[] = [];
  const perHood = new Map<string, number>();
  for (const { c, match } of scored.slice(0, 400)) {
    const busy = await busyAt(city.id, c.lat, c.lon).catch(() => null);
    if (!busy || busy.tier === "quiet") continue;
    const near = nearestCoreHood(core, c.lat, c.lon)?.h.name, n = perHood.get(near ?? c.g) ?? 0;
    if (n >= 2) continue;
    perHood.set(near ?? c.g, n + 1);
    out.push({ lat: c.lat, lon: c.lon, g: c.g, match_pct: Math.round(match * 100), busy_pct: busy.pct, busy_tier: busy.tier, near, link: `geo:${c.lat},${c.lon}` });
    if (out.length >= k) break;
  }
  return out;
}
const paint = (city: string, rows: { g: string; lat: number; lon: number; match_pct: number }[], label: string): AgentAction =>
  ({ type: "opportunity", city, kind: "lookalike", taste: label, cells: rows.map((r) => ({ g: r.g, lon: r.lon, lat: r.lat, demand: r.match_pct / 100, supply: 0, score: r.match_pct / 100 })) });

const brand_whitespace = defineTool({
  name: "brand_whitespace",
  description: "Chain expansion (the whitespace analysis location-intelligence firms sell): where a chain already is in a city (Overture Maps Places, 1,700+ chains per built-in city), and the busy blocks that match the taste of its existing sites but have no branch within 1 km. With target_city, takes the chain's taste profile from `city` to a city where it is absent or thin. Returns the chain's own backtest result when it was tested. Built-in cities only.",
  schema: z.object({
    brand: z.string().describe("chain name, e.g. 'Pret A Manger', 'Uniqlo', 'Aesop'"),
    city: z.string().describe("a city where the chain has branches"),
    target_city: z.string().optional().describe("look for whitespace here instead (taste profile still comes from `city`)"),
    k: z.number().int().min(3).max(10).optional(),
  }),
  async run({ brand, city, target_city, k }, { stats, progress }) {
    const src = await cityOrThrow(city, { stats, progress });
    const idx = await loadBrands(src.city.id);
    if (!idx) throw new ToolError(`No chain data for ${src.city.name}; brand tools cover the six built-in cities.`);
    const b = findBrand(idx, brand);
    if (!b) throw new ToolError(`No chain called "${brand}" with 3+ branches in ${src.city.name} (Overture Maps).`);
    const byG = new Map(src.core.cells.map((c) => [c.g, c]));
    const sites = Object.entries(b.g).flatMap(([g, n]) => { const c = byG.get(g); return c ? [{ ...c, w: n }] : []; });
    if (sites.length < 2) throw new ToolError(`${b.name}'s branches in ${src.city.name} fall outside Twin's taste grid.`);
    const fp = meanVec(sites);
    const tgt = target_city ? await cityOrThrow(target_city, { stats, progress }) : src;
    const tIdx = tgt === src ? idx : await loadBrands(tgt.city.id);
    const existing = tgt === src ? sites : Object.entries(tIdx ? findBrand(tIdx, b.name)?.g ?? {} : {}).map(([g]) => { const [lat, lon] = geohashCenter(g); return { lat, lon }; });
    const gaps = await rankLookalikes(tgt.city, tgt.core, fp, k ?? 6, existing);
    const fit = sites.map((s) => cosine(fp, s.v)).sort((x, y) => x - y)[Math.floor(sites.length / 2)];
    return {
      data: {
        brand: b.name, category: b.cat, chain_class: b.class, home_city: src.city.name, branches_in_home_city: Object.values(b.g).reduce((x, y) => x + y, 0),
        branches_in_target: target_city ? existing.length : undefined, target_city: tgt.city.name, whitespace: gaps,
        typical_branch_match_pct: Math.round(fit * 100),
        backtest: await brandEvidence(b.name),
        how: "fingerprint = mean taste of the blocks with branches; whitespace = busy or active blocks with the highest taste match and no branch within 1 km",
        caveat: b.class === "convenience" ? "convenience chains follow footfall more than taste (backtest AUC 0.55 within equally busy blocks)" : "taste-led chains: taste ranked real sites above equally busy blocks 69% of the time in the backtest",
        source: idx.source,
      },
      summary: `${b.name}: ${Object.keys(b.g).length} sites in ${src.city.name}; ${gaps.length} whitespace blocks in ${tgt.city.name}`,
      uiActions: [paint(tgt.city.id, gaps, `${b.name} whitespace`)],
    };
  },
});

const lookalike_sites = defineTool({
  name: "lookalike_sites",
  description: "Find blocks like your best locations: give 1–5 addresses or neighbourhoods where something already works, and a target city; returns busy blocks there whose taste matches the average of yours (works for any fingerprinted city, built-in or added). Use for 'my shops at X and Y do well, where else?'",
  schema: z.object({
    places: z.array(z.string()).min(1).max(5).describe("addresses, venues or neighbourhoods that work today"),
    target_city: z.string(),
    k: z.number().int().min(3).max(10).optional(),
  }),
  async run({ places, target_city, k }, { ds, stats, progress }) {
    const cities = await allCities();
    const found = await Promise.all(places.map((p) => twinSource(ds, p, cities, { stats, progress }).catch(() => null)));
    const ok = found.filter((x): x is NonNullable<typeof x> => !!x);
    if (!ok.length) throw new ToolError(`Couldn't place any of: ${places.join("; ")}.`);
    const tgt = await cityOrThrow(target_city, { stats, progress });
    // compare on the 40-dim core basket shared by every city
    const vecs = await Promise.all(ok.map(async (x) => {
      const core = await loadCore(x.city.id);
      return core ? hoodVec(core.cells, x.lat, x.lon)?.v ?? null : null;
    }));
    const usable = vecs.filter((v): v is number[] => !!v);
    if (!usable.length) throw new ToolError("No taste data around those places.");
    const fp = meanVec(usable.map((v) => ({ v, w: 1 })));
    const same = ok.filter((x) => x.city.id === tgt.city.id).map((x) => ({ lat: x.lat, lon: x.lon }));
    const sites = await rankLookalikes(tgt.city, tgt.core, fp, k ?? 6, same, 700);
    return {
      data: { from: ok.map((x) => ({ name: x.label, city: x.city.name })), unplaced: places.filter((_, i) => !found[i]), target_city: tgt.city.name, lookalikes: sites, dims: "40-dim core basket", ranking: "busy or active blocks only, by taste match to the average of your places; at most two per neighbourhood" },
      summary: `${sites.length} lookalike blocks in ${tgt.city.name} (top ${sites[0]?.near ?? "—"} ${sites[0]?.match_pct ?? ""}%)`,
      uiActions: [paint(tgt.city.id, sites, "lookalike sites")],
    };
  },
});

const site_check = defineTool({
  name: "site_check",
  description: "Scorecard for ONE address or venue (no Qloo quota): busyness, the block's strongest and weakest tastes vs its city, the venue mix within ~1 km, chains nearby, and the nearest neighbourhood with its closest twins abroad. Use when someone has a specific site in mind.",
  schema: z.object({ place: z.string().describe("address or venue, e.g. 'Weserstraße 50, Berlin'") }),
  async run({ place }, { ds }) {
    const g = (await geocode(place, 1))[0];
    if (!g) throw new ToolError(`Could not place "${place}".`);
    const city = (await allCities()).find((c) => hav(g.lat, g.lon, c.center[1], c.center[0]) < 80_000);
    if (!city) throw new ToolError(`"${place}" is not in a fingerprinted city; add_city can build it.`);
    const core = await loadCore(city.id);
    if (!core) throw new ToolError(`No taste data for ${city.name}.`);
    const hv = hoodVec(core.cells, g.lat, g.lon, 0.8);
    const labels = coreLabels(core);
    const ranked = hv ? hv.v.map((x, i) => ({ trait: labels[i], z: r2(x) })).sort((a, b) => b.z - a.z) : [];
    const sup = await loadSupply(city.id);
    const mix = sup ? supplyAround(sup, g.lat, g.lon, 1000, [...SUPPLY_KINDS]) : null;
    const brands = await loadBrands(city.id);
    const near = brands ? Object.entries(brands.brands).flatMap(([name, b]) => {
      const n = Object.entries(b.g).filter(([gg]) => { const [la, lo] = geohashCenter(gg); return hav(g.lat, g.lon, la, lo) <= 1000; }).reduce((s, [, c]) => s + c, 0);
      return n ? [{ name, n, class: b.class }] : [];
    }).sort((a, b) => b.n - a.n).slice(0, 10) : [];
    const hood = nearestCoreHood(core, g.lat, g.lon);
    const staticHood = hood && ds.hoods.find((h) => h.id === hood.h.id);
    const twins = staticHood ? Object.entries(ds.twins[staticHood.id] ?? {}).map(([c, list]) => ({ city: c, twin: ds.hoods.find((h) => h.id === list[0]?.hood)?.name, match_pct: Math.round((list[0]?.score ?? 0) * 100) })).sort((a, b) => b.match_pct - a.match_pct).slice(0, 3) : [];
    return {
      data: {
        place: g.display, link: `geo:${g.lat},${g.lon}`, city: city.name, neighbourhood: hood?.h.name, busy: await busyAt(city.id, g.lat, g.lon).catch(() => null),
        leans_into: ranked.slice(0, 6), leans_away_from: ranked.slice(-4).reverse(),
        venues_within_1km: mix ? Object.fromEntries(Object.entries(mix.counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 10)) : null,
        chains_within_1km: near, twins_abroad: twins,
        sources: ["Twin taste grid (Qloo heatmaps, popularity-corrected)", sup ? `${sup.source} ${sup.release}` : null, brands?.source].filter(Boolean),
      },
      summary: `${g.display.split(",").slice(0, 2).join(",")}: ${hood?.h.name ?? city.name}`,
      uiActions: [{ type: "focus", lat: g.lat, lon: g.lon, label: g.display.split(",")[0] }],
    };
  },
});

export const TOOLS_V2: ToolDef[] = [brand_whitespace, lookalike_sites, site_check, add_city, geocode_tool, twins_anywhere, gap_scan, scene, compare_taste, trend, opportunity, tour, web_search, read_page, wiki, venue_supply, reportSkillTool, ...REPORT_TOOLS];
