import { createHash } from "node:crypto";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";
import type { City, Hood } from "../types";
import type { Report } from "./report-types";
import { geocode, type GeoHit } from "./net";
import { qlooGet } from "./qloo";

export const baselineSchema = z.object({
  answer: z.string().trim().min(1).max(16000),
  places: z.array(z.object({
    name: z.string().trim().min(1).max(180),
    city: z.string().trim().max(180),
    kind: z.enum(["neighbourhood", "venue"]),
    claim: z.string().trim().max(1200),
  })).max(12),
});

export type PlainAnswer = z.infer<typeof baselineSchema>;
export type BaselineStatus = "verified" | "not found" | "wrong city" | "unchecked";
export type ReportPlace = NonNullable<Report["places"]>[number];
export type VerifiedPlace = PlainAnswer["places"][number] & {
  status: BaselineStatus;
  reason: string;
  source?: "Twin" | "OpenStreetMap" | "Qloo";
  matchedName?: string;
  address?: string;
  link?: string;
}
export interface BaselineResult {
  question: string;
  model: string;
  requestedModel: string;
  createdAt: string;
  answer: string;
  places: VerifiedPlace[];
}
export interface BaselineComparison extends BaselineResult {
  reportId?: string;
  reportPlaces: ReportPlace[];
  missedPlaces: ReportPlace[];
}
export interface BaselineVenue {
  id: string;
  name: string;
  types: string[];
  address?: string;
  city?: string;
  lat?: number;
  lon?: number;
}
export interface BaselineData {
  cities: Pick<City, "id" | "name" | "country">[];
  hoods: Pick<Hood, "id" | "name" | "city" | "lat" | "lon">[];
}
export interface BaselineLookups {
  geocode: (query: string, limit?: number) => Promise<GeoHit[]>;
  searchVenues: (query: string) => Promise<BaselineVenue[]>;
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sameName = (a: string, b: string) => norm(a).replace(/^the /, "") === norm(b).replace(/^the /, "");
const aliases: Record<string, string[]> = {
  "new-york": ["New York City", "NYC"],
  "los-angeles": ["LA", "L A"],
  "mexico-city": ["CDMX", "Ciudad de México"],
};
const cityNames = (c: BaselineData["cities"][number]) => [c.name, c.id, ...(aliases[c.id] ?? [])];
function findCity(text: string, ds: BaselineData) {
  const q = norm(text);
  return ds.cities.find((c) => cityNames(c).some((name) => q === norm(name) || q === norm(`${name}, ${c.country}`)));
}
const cityKey = (text: string, ds: BaselineData) => findCity(text, ds)?.id ?? norm(text);
const hoodType = (hit: GeoHit) => /^(boundary\/administrative|place\/(neighbourhood|neighborhood|suburb|quarter|borough|city_district|district|locality|village|hamlet|residential))$/.test(hit.type);
const cityType = (hit: GeoHit) => /^(boundary\/administrative|place\/(city|town|municipality|borough|village))$/.test(hit.type);

async function searchVenues(query: string): Promise<BaselineVenue[]> {
  const response = await qlooGet<{ results?: {
    entity_id: string; name: string; types?: string[]; subtype?: string;
    location?: { lat?: number; lon?: number };
    properties?: { address?: string; geocode?: { city?: string } };
  }[] }>("/search", { query, types: "urn:entity:place", take: 10 });
  if (!Array.isArray(response.results)) throw new Error("Missing Qloo search results");
  return response.results.map((e) => ({
    id: e.entity_id, name: e.name, types: e.types ?? (e.subtype ? [e.subtype] : []),
    address: e.properties?.address, city: e.properties?.geocode?.city,
    lat: e.location?.lat, lon: e.location?.lon,
  }));
}

/** Lookups are injectable so the exact production checks can also run without network access. */
export async function verifyBaseline(plain: PlainAnswer, ds: BaselineData, lookups: BaselineLookups = { geocode, searchVenues }): Promise<VerifiedPlace[]> {
  const geo = new Map<string, Promise<GeoHit[]>>();
  const venues = new Map<string, Promise<BaselineVenue[]>>();
  const lookupGeo = (query: string) => {
    if (!geo.has(query)) geo.set(query, lookups.geocode(query, 5));
    return geo.get(query)!;
  };
  const lookupVenues = (query: string) => {
    if (!venues.has(query)) venues.set(query, lookups.searchVenues(query));
    return venues.get(query)!;
  };
  const checkCity = async (city: string, address?: string, lat?: number, lon?: number, actualCity?: string): Promise<Pick<VerifiedPlace, "status" | "reason">> => {
    const target = findCity(city, ds);
    const names = target ? cityNames(target) : [city.split(",")[0].trim()];
    const qualified = !target && city.includes(",");
    const cityMatches = !!actualCity && (cityKey(actualCity, ds) === cityKey(city, ds) || names.some((name) => sameName(name, actualCity)));
    if (actualCity && !cityMatches) return { status: "wrong city", reason: `The matching place is in ${actualCity}, rather than ${city}.` };
    // Only a city/address component counts; a city name in the venue or street name does not.
    const parts = (address ?? "").split(",").slice(1).map(norm);
    const addressMatches = parts.some((part) => names.filter((name) => name === target?.name || norm(name).length > 3 || !target).some((name) => {
      const n = norm(name);
      return part === n || new RegExp(`^${n} \\d[\\w -]*$|^\\d[\\w -]* ${n}$`, "u").test(part);
    })) && (!qualified || city.split(",").slice(1).every((part) => parts.includes(norm(part))));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const query = target ? `${target.name}, ${target.country}` : city;
      const bounds = (await lookupGeo(query)).find((hit) => cityType(hit) && names.some((name) => sameName(name, hit.name)));
      if (bounds) {
        const [south, west, north, east] = bounds.bbox;
        if (lat! >= south && lat! <= north && lon! >= west && lon! <= east) return { status: "verified", reason: `The place name matches and its location is within the mapped area of ${city}.` };
        return { status: "wrong city", reason: `The matching place is outside the mapped area of ${city}${address ? `: ${address}` : "."}` };
      }
    }
    if (addressMatches || (cityMatches && !qualified)) return { status: "verified", reason: `The place name matches and its address is in ${city}.` };
    return { status: "unchecked", reason: `The name matches, but its city could not be confirmed (${city}).` };
  };
  const verify = async (place: PlainAnswer["places"][number]): Promise<VerifiedPlace> => {
    if (!place.city.trim()) return { ...place, status: "unchecked", reason: "The plain answer did not name a city for this place." };
    try {
      if (place.kind === "neighbourhood") {
        const city = findCity(place.city, ds);
        const hood = city && ds.hoods.find((h) => h.city === city.id && sameName(h.name, place.name));
        if (hood) return { ...place, status: "verified", reason: `Twin lists this neighbourhood in ${city.name}.`, source: "Twin", matchedName: hood.name, link: `hood:${hood.id}` };
        const local = await lookupGeo(`${place.name}, ${place.city}`);
        let matches = local.filter((hit) => hoodType(hit) && sameName(hit.name, place.name));
        if (!matches.length) matches = (await lookupGeo(place.name)).filter((hit) => hoodType(hit) && sameName(hit.name, place.name));
        if (!matches.length) return { ...place, status: "not found", reason: `No matching neighbourhood was found in Twin or OpenStreetMap for ${place.city}.`, source: "OpenStreetMap" };
        let best: VerifiedPlace | undefined;
        for (const hit of matches) {
          const checked = await checkCity(place.city, hit.display, hit.lat, hit.lon);
          const result = { ...place, ...checked, source: "OpenStreetMap" as const, matchedName: hit.name, address: hit.display, link: `geo:${hit.lat},${hit.lon}` };
          if (checked.status === "verified") return result;
          if (!best || checked.status === "unchecked") best = result;
        }
        return best!;
      }
      const local = await lookupVenues(`${place.name}, ${place.city}`);
      let matches = local.filter((hit) => sameName(hit.name, place.name));
      if (!matches.length) matches = (await lookupVenues(place.name)).filter((hit) => sameName(hit.name, place.name));
      if (!matches.length) return { ...place, status: "not found", reason: `Qloo returned no place with this name for ${place.city}. A missing listing does not prove it does not exist.`, source: "Qloo" };
      let best: VerifiedPlace | undefined;
      for (const hit of matches) {
        if (!hit.types.includes("urn:entity:place")) continue;
        const checked = await checkCity(place.city, hit.address, hit.lat, hit.lon, hit.city);
        const result = { ...place, ...checked, source: "Qloo" as const, matchedName: hit.name, address: hit.address, ...(Number.isFinite(hit.lat) && Number.isFinite(hit.lon) ? { link: `geo:${hit.lat},${hit.lon}` } : {}) };
        if (checked.status === "verified") return result;
        if (!best || checked.status === "unchecked") best = result;
      }
      return best ?? { ...place, status: "unchecked", reason: "Qloo matched the name but did not identify the result as a place.", source: "Qloo" };
    } catch {
      return { ...place, status: "unchecked", reason: `${place.kind === "venue" ? "Qloo or the city lookup" : "OpenStreetMap"} was unavailable. This place has not been checked.` };
    }
  };
  const results: VerifiedPlace[] = new Array(plain.places.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, plain.places.length) }, async () => {
    while (next < plain.places.length) {
      const i = next++;
      results[i] = await verify(plain.places[i]);
    }
  }));
  return results;
}

export function missedReportPlaces(plain: readonly VerifiedPlace[], places: readonly ReportPlace[], ds: BaselineData): ReportPlace[] {
  return places.filter((place) => {
    const hood = place.link.startsWith("hood:") ? ds.hoods.find((h) => h.id === place.link.slice(5)) : undefined;
    return !plain.some((p) => {
      if (hood && cityKey(p.city, ds) !== hood.city) return false;
      if (sameName(p.name, hood?.name ?? place.label) || sameName(`${p.name}, ${p.city}`, place.label)) return true;
      return !!p.link && p.link === place.link;
    });
  });
}

export function parsePlainAnswer(text: string): PlainAnswer {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The plain model did not return an answer in the requested format.");
  return baselineSchema.parse(JSON.parse(text.slice(start, end + 1)));
}

export const baselineCacheKey = (question: string, model: string) => `baseline/${createHash("sha256").update(JSON.stringify([question.trim(), model])).digest("hex")}.json`;
const pending = new Map<string, Promise<BaselineResult>>();

export async function runBaseline(question: string, primary: string, apiKey: string, ds: BaselineData, signal?: AbortSignal): Promise<BaselineResult> {
  // The plain answer is never stored: each comparison is a fresh model call. Only the data lookups that verify it are cached.
  const key = baselineCacheKey(question, primary);
  const current = pending.get(key);
  if (current) return current;
  const work = (async () => {
    const { OPENROUTER_MODELS, fallbackOptions } = await import("./ai");
    const provider = createOpenAICompatible({
      name: "openrouter", apiKey, baseURL: "https://openrouter.ai/api/v1",
      headers: { "HTTP-Referer": "https://github.com/srthkdev/twin", "X-Title": "Twin" },
      includeUsage: true, supportsStructuredOutputs: true,
    });
    const abortSignal = AbortSignal.any([AbortSignal.timeout(165_000), ...(signal ? [signal] : [])]);
    const prompt = `${question}\n\nReturn JSON only: {"answer": string, "places": [{"name": string, "city": string, "kind": "neighbourhood" | "venue", "claim": string}]}. Give a concise answer in plain words. Include every place named in the answer in places, at most 12 distinct neighbourhoods or venues. Use its full city name, with country where ambiguous; use an empty city if unknown. The claim is what your answer says about that place.`;
    let plain: PlainAnswer | undefined, model = primary;
    for (const candidate of [primary, ...OPENROUTER_MODELS.filter((m) => m !== primary)]) {
      for (const structured of [true, false]) {
        let streamError: unknown;
        const result = streamText({
          model: provider(candidate), instructions: "Answer as a helpful assistant.", prompt,
          ...(structured ? { output: Output.object({ schema: baselineSchema }) } : {}),
          providerOptions: fallbackOptions(candidate), temperature: 0.4, maxOutputTokens: 5000,
          timeout: { firstChunkMs: 30_000, chunkMs: 45_000, totalMs: 60_000 }, maxRetries: 0, abortSignal,
          onError: ({ error }) => { streamError = error; },
        });
        try {
          plain = structured ? baselineSchema.parse(await result.output) : parsePlainAnswer(await result.text);
        } catch (error) {
          if (abortSignal.aborted) throw new Error("The plain AI answer timed out. Try again.");
          const failure = streamError ?? error;
          try { plain = parsePlainAnswer((NoObjectGeneratedError.isInstance(failure) ? failure.text : undefined) ?? await result.text); } catch { /* Try another supported output mode or model. */ }
          if (!plain) {
            if (structured && (NoObjectGeneratedError.isInstance(failure) || (APICallError.isInstance(failure) && [400, 422].includes(failure.statusCode ?? 0)))) continue;
            break;
          }
        }
        model = (await result.response).modelId || candidate;
        break;
      }
      if (plain) break;
    }
    if (!plain) throw new Error("The plain AI could not answer right now. Try again.");
    const places = await verifyBaseline(plain, ds);
    const result: BaselineResult = { question, model, requestedModel: primary, createdAt: new Date().toISOString(), answer: plain.answer, places };
    return result;
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}
