// Venue SUPPLY (how many of a kind physically exist per 1 km cell), precomputed from Overture Maps Places by
// pipeline/supply.py. Instant at runtime; cities without a precomputed file fall back to live OpenStreetMap.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { geohashCenter, hav } from "./geo";
import { storeGet } from "./store";

export const SUPPLY_KINDS = ["bar", "wine_bar", "cocktail_bar", "cafe", "nightclub", "music_venue", "record_store", "art_gallery", "bookstore", "vintage", "boutique", "gym", "yoga", "bakery", "vegan", "ramen", "sushi", "mexican", "korean", "gay_bar", "comedy_club", "cinema", "tattoo", "brewery", "restaurant"] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];
/** Closest OpenStreetMap kind for the live fallback. */
export const OSM_FALLBACK: Record<SupplyKind, string> = {
  bar: "bar", wine_bar: "wine_shop", cocktail_bar: "bar", cafe: "cafe", nightclub: "nightclub", music_venue: "music_venue", record_store: "record_shop",
  art_gallery: "art_gallery", bookstore: "bookshop", vintage: "vintage_clothing", boutique: "clothing", gym: "gym", yoga: "gym", bakery: "bakery",
  vegan: "vegan_restaurant", ramen: "cuisine:ramen", sushi: "cuisine:sushi", mexican: "cuisine:mexican", korean: "cuisine:korean", gay_bar: "gay_bar",
  comedy_club: "theatre", cinema: "cinema", tattoo: "shop=tattoo", brewery: "craft=brewery", restaurant: "restaurant",
};

export interface Supply { city: string; source: string; release: string; kinds: string[]; cells: Record<string, number[]> }
const mem = new Map<string, Supply | null>();

/** Counts across all kinds, with specialised bars/cuisines counted once through their rollups. */
export function supplyTotal(s: Supply, counts: number[]) {
  const nested = new Set<string>();
  if (s.kinds.includes("bar")) ["wine_bar", "cocktail_bar", "gay_bar"].forEach((k) => nested.add(k));
  if (s.kinds.includes("restaurant")) ["vegan", "ramen", "sushi", "mexican", "korean"].forEach((k) => nested.add(k));
  return s.kinds.reduce((total, kind, i) => total + (nested.has(kind) ? 0 : counts[i] ?? 0), 0);
}

export const GAP_KINDS = SUPPLY_KINDS.filter((k) => k !== "bar" && k !== "restaurant");

export async function loadSupply(cityId: string): Promise<Supply | null> {
  if (mem.has(cityId)) return mem.get(cityId)!;
  let s: Supply | null = null;
  try { s = JSON.parse(await readFile(join(process.env.TWIN_WEB_ROOT ?? process.cwd(), "public", "data", "supply", `${cityId}.json`), "utf8")) as Supply; }
  catch { s = await storeGet<Supply>(`supply/${cityId}.json`); }
  mem.set(cityId, s);
  return s;
}

let kindsMem: Record<string, string[]> | null = null;
/** kind -> the Overture categories it counts (written by pipeline/supply.py). */
export async function loadKindCategories(): Promise<Record<string, string[]>> {
  if (kindsMem) return kindsMem;
  try { kindsMem = JSON.parse(await readFile(join(process.env.TWIN_WEB_ROOT ?? process.cwd(), "public", "data", "supply", "kinds.json"), "utf8")); }
  catch { kindsMem = {}; }
  return kindsMem!;
}

/** Venue counts per kind within `radiusM` of a point (sums the 1 km cells whose centre is inside the radius). */
export function supplyAround(s: Supply, lat: number, lon: number, radiusM: number, kinds: string[]) {
  const idx = kinds.map((k) => s.kinds.indexOf(k));
  const tot = kinds.map(() => 0);
  let cells = 0;
  for (const [g, counts] of Object.entries(s.cells)) {
    const [la, lo] = geohashCenter(g);
    if (hav(lat, lon, la, lo) > radiusM) continue;
    cells++;
    idx.forEach((i, j) => { if (i >= 0) tot[j] += counts[i]; });
  }
  return { cells, counts: Object.fromEntries(kinds.map((k, j) => [k, tot[j]])) };
}
