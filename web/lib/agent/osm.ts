// OpenStreetMap = physical facts only (what physically exists where). Never a recommender: Qloo picks venues.
import { geohash } from "./geo";
import { overpass, type OsmEl } from "./net";
import { ToolError } from "./tool-kit";

interface KindSpec { filters: string[]; test: (t: Record<string, string>) => boolean; osm: string }
const eq = (k: string, ...vals: string[]) => (t: Record<string, string>) => vals.includes(t[k]);
const KIND_SPECS: Record<string, KindSpec> = {
  bar: { osm: "amenity=bar|pub", filters: [`["amenity"~"^(bar|pub)$"]`], test: eq("amenity", "bar", "pub") },
  pub: { osm: "amenity=pub", filters: [`["amenity"="pub"]`], test: eq("amenity", "pub") },
  cafe: { osm: "amenity=cafe", filters: [`["amenity"="cafe"]`], test: eq("amenity", "cafe") },
  coffee_roaster: { osm: "craft=roaster | shop=coffee", filters: [`["craft"="roaster"]`, `["shop"="coffee"]`], test: (t) => t.craft === "roaster" || t.shop === "coffee" },
  nightclub: { osm: "amenity=nightclub", filters: [`["amenity"="nightclub"]`], test: eq("amenity", "nightclub") },
  record_shop: { osm: "shop=music | shop=records", filters: [`["shop"~"^(music|records)$"]`], test: eq("shop", "music", "records") },
  art_gallery: { osm: "tourism=gallery | shop=art", filters: [`["tourism"="gallery"]`, `["shop"="art"]`], test: (t) => t.tourism === "gallery" || t.shop === "art" },
  bookshop: { osm: "shop=books", filters: [`["shop"="books"]`], test: eq("shop", "books") },
  restaurant: { osm: "amenity=restaurant", filters: [`["amenity"="restaurant"]`], test: eq("amenity", "restaurant") },
  vegan_restaurant: { osm: "amenity=restaurant + diet:vegan=only|yes", filters: [`["amenity"="restaurant"]["diet:vegan"~"^(only|yes)$"]`], test: (t) => t.amenity === "restaurant" && /^(only|yes)$/.test(t["diet:vegan"] ?? "") },
  music_venue: { osm: "amenity=music_venue | concert_hall", filters: [`["amenity"~"^(music_venue|concert_hall)$"]`], test: eq("amenity", "music_venue", "concert_hall") },
  theatre: { osm: "amenity=theatre", filters: [`["amenity"="theatre"]`], test: eq("amenity", "theatre") },
  cinema: { osm: "amenity=cinema", filters: [`["amenity"="cinema"]`], test: eq("amenity", "cinema") },
  museum: { osm: "tourism=museum", filters: [`["tourism"="museum"]`], test: eq("tourism", "museum") },
  gym: { osm: "leisure=fitness_centre", filters: [`["leisure"="fitness_centre"]`], test: eq("leisure", "fitness_centre") },
  park: { osm: "leisure=park", filters: [`["leisure"="park"]`], test: eq("leisure", "park") },
  bakery: { osm: "shop=bakery", filters: [`["shop"="bakery"]`], test: eq("shop", "bakery") },
  wine_shop: { osm: "shop=wine", filters: [`["shop"="wine"]`], test: eq("shop", "wine") },
  vintage_clothing: { osm: "shop=second_hand | clothes with second_hand=only", filters: [`["shop"="second_hand"]`, `["shop"="clothes"]["second_hand"~"^(only|yes)$"]`], test: (t) => t.shop === "second_hand" || (t.shop === "clothes" && /^(only|yes)$/.test(t.second_hand ?? "")) },
  clothing: { osm: "shop=clothes", filters: [`["shop"="clothes"]`], test: eq("shop", "clothes") },
  gay_bar: { osm: "amenity=bar + gay=yes|lgbtq=primary", filters: [`["amenity"="bar"]["gay"="yes"]`, `["amenity"="bar"]["lgbtq"="primary"]`], test: (t) => t.amenity === "bar" && (t.gay === "yes" || t.lgbtq === "primary") },
};
export const OSM_KIND_NAMES = Object.keys(KIND_SPECS);

const safeRe = (s: string) => s.replace(/[^\p{L}\p{N}_ -]/gu, "").slice(0, 40);

/** Known name, `cuisine:thai` (restaurants of that cuisine) or a raw `key=value` OSM tag. */
export function osmKind(kind: string): KindSpec {
  const k = kind.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (KIND_SPECS[k]) return KIND_SPECS[k];
  const c = kind.match(/^(?:restaurant:|cuisine:)\s*([\p{L}_ -]{2,30})$/iu);
  if (c) { const cu = safeRe(c[1]).toLowerCase().replace(/[\s-]+/g, "_"); return { osm: `amenity=restaurant + cuisine~${cu}`, filters: [`["amenity"="restaurant"]["cuisine"~"${cu}",i]`], test: (t) => t.amenity === "restaurant" && (t.cuisine ?? "").toLowerCase().includes(cu) }; }
  const kv = kind.match(/^([a-z_:]{2,30})=([a-z0-9_:]{1,40})$/i);
  if (kv) return { osm: `${kv[1]}=${kv[2]}`, filters: [`["${kv[1]}"="${kv[2]}"]`], test: (t) => t[kv[1]] === kv[2] };
  throw new ToolError(`Unknown venue kind "${kind}". Known: ${OSM_KIND_NAMES.join(", ")}; also "cuisine:thai" or a raw tag like "amenity=bar".`);
}

export interface VenueRow { name: string; lat: number; lon: number; osm: string; cuisine?: string; website?: string }
const elLL = (e: OsmEl): [number, number] | null => (e.lat != null && e.lon != null ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null);

/** Counts + up to 15 named features per kind around a point (physical facts; cites OSM ids). */
export async function osmAround(lat: number, lon: number, radius: number, kinds: string[]): Promise<{ kind: string; osm_tags: string; count: number; named: VenueRow[] }[]> {
  const specs = kinds.map((k) => ({ k, s: osmKind(k) }));
  const body = specs.flatMap(({ s }) => s.filters.map((f) => `nwr(around:${Math.round(radius)},${lat},${lon})${f};`)).join("");
  const els = await overpass(`[out:json][timeout:30];(${body});out center tags 1800;`, { ttlMs: 24 * 3600_000 });
  return specs.map(({ k, s }) => {
    const m = els.filter((e) => e.tags && s.test(e.tags));
    const named: VenueRow[] = [];
    for (const e of m) {
      const ll = elLL(e);
      if (!e.tags?.name || !ll || named.length >= 15) continue;
      named.push({ name: e.tags.name, lat: Math.round(ll[0] * 1e5) / 1e5, lon: Math.round(ll[1] * 1e5) / 1e5, osm: `${e.type}/${e.id}`, cuisine: e.tags.cuisine, website: e.tags.website });
    }
    return { kind: k, osm_tags: s.osm, count: m.length, named };
  });
}

/** Venue count per geohash-6 cell over a bbox, tiled so each Overpass query stays small. Failed tiles are reported. */
export async function osmSupplyGrid(bbox: [number, number, number, number], kind: string, onTile?: (done: number, total: number) => void): Promise<{ counts: Map<string, number>; tilesOk: boolean[]; cols: number; rows: number; step: number; s: number; w: number }> {
  const spec = osmKind(kind), [s, w, n, e] = bbox, step = 0.2;
  const rows = Math.max(1, Math.ceil((n - s) / step)), cols = Math.max(1, Math.ceil((e - w) / step)), total = rows * cols;
  const counts = new Map<string, number>(), seen = new Set<string>(), tilesOk: boolean[] = new Array(total).fill(false);
  let done = 0, next = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      const r = Math.floor(i / cols), c = i % cols;
      const a = Math.round((s + r * step) * 1e4) / 1e4, b = Math.round((w + c * step) * 1e4) / 1e4, cc = Math.round((s + (r + 1) * step) * 1e4) / 1e4, d = Math.round((w + (c + 1) * step) * 1e4) / 1e4;
      try {
        const els = await overpass(`[out:json][timeout:30];(${spec.filters.map((f) => `nwr(${a},${b},${cc},${d})${f};`).join("")});out center qt;`, { ttlMs: 7 * 86400_000 });
        for (const el of els) {
          const id = `${el.type}/${el.id}`, ll = elLL(el);
          if (seen.has(id) || !ll) continue;
          seen.add(id);
          const g = geohash(ll[0], ll[1], 6);
          counts.set(g, (counts.get(g) ?? 0) + 1);
        }
        tilesOk[i] = true;
      } catch { /* tile stays failed */ }
      onTile?.(++done, total);
    }
  }));
  return { counts, tilesOk, cols, rows, step, s, w };
}
