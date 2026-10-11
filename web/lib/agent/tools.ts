// Tool layer: deterministic, data-backed functions. An LLM agent can expose these
// as tool definitions (see TOOL_SPECS) without any other change.
import type { DataSet, Hood, TwinMatch } from "../types";
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

export const TOOL_SPECS = [
  { name: "findTwins", description: "Top cultural twins of a neighbourhood in a target city.", input: { hoodId: "string", cityId: "string", k: "number?" } },
  { name: "explainMatch", description: "Why two neighbourhoods match: shared and diverging taste dimensions.", input: { aId: "string", bId: "string" } },
  { name: "listHoods", description: "List neighbourhoods in a city.", input: { cityId: "string" } },
] as const;
