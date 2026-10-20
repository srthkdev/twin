// Agent v2 tools: any city on Earth, Qloo-native taste tools, and complementary non-taste sources.
// Role split (enforced in descriptions and the system prompt):
//   Qloo        -> every taste judgement: twins, what a place over-indexes on, venue picks, audiences, trends, demand.
//   OSM         -> physical facts only: neighbourhoods and how many venues of a kind physically exist (supply).
//   Nominatim   -> place name -> coordinates.
//   Wikipedia   -> background facts.   Web search -> current facts Qloo lacks (events, news, closures, rents), cited.
import { z } from "zod";
import {
  CORE_BASKET, allCities, correctItem, ensureCity, fetchHeat, findCityAny, hoodVec, loadCore, qlooQueryFor,
  type CityMeta, type CoreFile, type CoreHood,
} from "./city-live";
import { cosine, hav, slug } from "./geo";
import { geocode } from "./net";
import { BASKET_KEYS } from "./node-data";
import { osmAround, osmSupplyGrid } from "./osm";
import { OSM_FALLBACK, SUPPLY_KINDS, loadSupply, supplyAround, type SupplyKind } from "./supply";
import { fmtHours, qlooCompare, qlooGet, qlooResolveTag, qlooScene, qlooSearchEntity, qlooTrend } from "./qloo";
import { ToolError, defineTool, r2, r3, type ToolDef } from "./tool-kit";
import type { AgentAction, OpportunityCell } from "./types";
import { readPage, webSearch, wikiLookup } from "./web";
import type { DataSet, Hood } from "../types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const CORE_LABEL = new Map(CORE_BASKET.map((c) => [c.id, c.label]));
const coreLabels = (core: CoreFile) => core.items.map((id) => CORE_LABEL.get(id) ?? id);

async function cityOrThrow(text: string): Promise<{ city: CityMeta; core: CoreFile }> {
  const city = await findCityAny(text);
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
  async run({ source, target_city, k }, { ds }) {
    const tgt = await cityOrThrow(target_city);
    let srcVec: number[] | null = null, srcName = source, srcCity: CityMeta | null = null, srcHoodId: string | null = null;
    for (const c of await allCities()) {
      const core = await loadCore(c.id);
      const h = core?.hoods.find((x) => x.id === source || norm(x.name) === norm(source));
      if (h) { srcVec = h.v; srcName = h.name; srcCity = c; srcHoodId = h.id; break; }
    }
    if (!srcVec) {
      const g = (await geocode(source, 1))[0];
      if (!g) throw new ToolError(`Could not place "${source}".`);
      for (const c of await allCities()) {
        if (hav(g.lat, g.lon, c.center[1], c.center[0]) > 80_000) continue;
        const core = await loadCore(c.id);
        const hv = core && hoodVec(core.cells, g.lat, g.lon);
        if (hv) { srcVec = hv.v; srcName = g.name; srcCity = c; break; }
      }
      if (!srcVec) throw new ToolError(`"${source}" is not inside a fingerprinted city. Call add_city for its city first.`);
    }
    if (srcCity?.id === tgt.city.id) throw new ToolError("Source and target are in the same city.");
    const labels = coreLabels(tgt.core);
    const ranked = tgt.core.hoods.map((h) => ({ h, s: cosine(srcVec!, h.v) })).sort((a, b) => b.s - a.s);
    const top = ranked.slice(0, k ?? 5).map(({ h, s }, i) => {
      const dims = h.v.map((x, d) => ({ d, a: srcVec![d], b: x }));
      return {
        rank: i + 1, hood_id: h.id, name: h.name, cosine: r3(s),
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
    if (!type) throw new ToolError(`Qloo trends cover artists, brands, films, shows, books, podcasts and people — "${e.name}" is ${e.types[0] ?? "something else"}.`);
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
  description: "Where to open something: Qloo DEMAND for a taste (corrected heatmap, per 1 km cell) against physical SUPPLY (how many venues of that kind exist there, from Overture Maps Places). High score = people here over-index on the taste but few such venues exist. Paints the map.",
  schema: z.object({
    city: z.string(),
    taste: z.string().describe("what people should love, e.g. 'wine bar', 'natural wine', 'Peggy Gou', 'ramen'"),
    taste_is: z.enum(["place_type", "entity"]).optional().describe("place_type (default) for venue genres/cuisines, entity for an artist/brand"),
    supply_kind: z.enum(SUPPLY_KINDS).describe("venue kind to count as existing supply"),
  }),
  live: true,
  async run({ city, taste, taste_is, supply_kind }, { stats, progress }) {
    const { city: c, core } = await cityOrThrow(city);
    progress(`qloo demand for ${taste} in ${c.name}`);
    const sig = await tasteSignal(taste, taste_is ?? "place_type", stats);
    const heat = await fetchHeat(await qlooQueryFor(c.id), sig.key, sig.val, stats);
    const { z: dz, present } = correctItem(core, heat);
    if (present < 50) throw new ToolError(`Qloo has too little demand data for "${sig.name}" in ${c.name} (${present} cells).`);
    const lats = core.cells.map((x) => x.lat).sort((a, b) => a - b), lons = core.cells.map((x) => x.lon).sort((a, b) => a - b);
    const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
    const bbox: [number, number, number, number] = [q(lats, 0.03), q(lons, 0.03), q(lats, 0.97), q(lons, 0.97)];
    const pre = await loadSupply(c.id);
    let supplyOf: (g: string, lat: number, lon: number) => number | null, supplySource: string;
    if (pre) {
      const ki = pre.kinds.indexOf(supply_kind);
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
    const rows = core.cells.map((cell, i) => ({ cell, demand: dz[i], supply: supplyOf(cell.g, cell.lat, cell.lon) }))
      .filter((x): x is { cell: typeof x.cell; demand: number; supply: number } => x.supply !== null && heat.has(x.cell.g));
    if (rows.length < 30) throw new ToolError("Venue supply data is unavailable for most of the city right now. Try again shortly.");
    const sz = zs(rows.map((x) => Math.log1p(x.supply)));
    const cells: OpportunityCell[] = rows.map((x, i) => ({ g: x.cell.g, lon: x.cell.lon, lat: x.cell.lat, demand: r2(x.demand), supply: x.supply, score: r2(x.demand - sz[i]) }));
    const best = cells.filter((x) => x.demand > 0.5).sort((a, b) => b.score - a.score).slice(0, 10)
      .map((x) => ({ ...x, near: nearestCoreHood(core, x.lat, x.lon)?.h.name }));
    const totalSupply = rows.reduce((s, x) => s + x.supply, 0);
    return {
      data: { city: c.name, taste: sig.name, supply_kind, supply_source: supplySource, cells_scored: rows.length, venues_counted: totalSupply, top_opportunities: best, how: "score = Qloo demand z − z(log(1 + venue count)); open map data misses some venues, treat supply as a lower bound" },
      summary: `${best.length} gaps for ${sig.name} in ${c.name} (${totalSupply} existing ${supply_kind} counted)`,
      uiActions: [{ type: "opportunity", city: c.id, kind: supply_kind, taste: sig.name, cells }],
    };
  },
});

const tour = defineTool({
  name: "tour",
  description: "Tour planning for an artist across cities: Qloo corrected affinity per 1 km cell in each city (where the fans actually are), the strongest neighbourhoods, and Qloo live-music venues near them. Cities must be fingerprinted (built-in or add_city).",
  schema: z.object({ artist: z.string(), cities: z.array(z.string()).min(1).max(5) }),
  live: true,
  async run({ artist, cities }, { stats, progress }) {
    const sig = await tasteSignal(artist, "entity", stats);
    const venueTag = await qlooResolveTag("live music venue", stats);
    const out: unknown[] = [];
    for (const name of cities) {
      try {
        const { city, core } = await cityOrThrow(name);
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
    kinds: z.array(z.enum(SUPPLY_KINDS)).min(1).max(6),
  }),
  async run({ place, lat, lon, radius_m, kinds }) {
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
      return { data: { where, radius_m: radius, source: `${pre.source} ${pre.release}`, counts: r.counts, cells: r.cells, note: "counts are a lower bound" }, summary: kinds.map((k) => `${r.counts[k]} ${k}`).join(", ") };
    }
    const rows = await osmAround(la, lo, radius, kinds.map((k) => OSM_FALLBACK[k]));
    return { data: { where, radius_m: radius, source: "OpenStreetMap (live)", kinds: rows }, summary: rows.map((r) => `${r.count} ${r.kind}`).join(", ") };
  },
});

const brief = defineTool({
  name: "brief",
  description: "Package findings as a downloadable markdown brief (e.g. a move brief, an opening brief, a tour plan). Only include facts you got from tools; keep source URLs.",
  schema: z.object({
    title: z.string().min(3),
    sections: z.array(z.object({ heading: z.string(), body: z.string() })).min(1).max(10),
  }),
  async run({ title, sections }) {
    const md = `# ${title}\n\n_Generated by Twin · taste data from Qloo · ${new Date().toISOString().slice(0, 10)}_\n\n${sections.map((s) => `## ${s.heading}\n\n${s.body.trim()}\n`).join("\n")}`;
    const filename = `${slug(title) || "twin-brief"}.md`;
    return { data: { filename, chars: md.length }, summary: `brief ready: ${filename}`, uiActions: [{ type: "download", filename, markdown: md }] };
  },
});

export const TOOLS_V2: ToolDef[] = [add_city, geocode_tool, twins_anywhere, scene, compare_taste, trend, opportunity, tour, web_search, read_page, wiki, venue_supply, brief];
