// Web context tools: search (Tavily -> Brave -> DuckDuckGo HTML), page reader (r.jina.ai), Wikipedia/Wikidata.
// These supply current facts and citations only; taste and venue picks come from Qloo.
import { diskCached, httpJson, httpText } from "./net";
import { ToolError } from "./tool-kit";

export interface SearchHit { title: string; url: string; snippet: string }
const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export function parseDdg(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let url = m[1].replace(/&amp;/g, "&");
    if (url.startsWith("//")) url = "https:" + url;
    try {
      const u = new URL(url);
      if (u.hostname.endsWith("duckduckgo.com") && u.pathname.startsWith("/l/")) url = u.searchParams.get("uddg") ?? url; // decode the redirect
    } catch { continue; }
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue; // skip ads
    out.push({ title: strip(m[2]), url, snippet: strip(m[3] ?? m[4] ?? "") });
  }
  return out;
}

export async function webSearch(query: string, k: number): Promise<{ provider: string; results: SearchHit[] }> {
  const q = query.trim().slice(0, 300);
  return diskCached("search", `${q}|${k}`, 3600_000, async () => {
    const tav = process.env.TAVILY_API_KEY, brave = process.env.BRAVE_API_KEY;
    if (tav) {
      try {
        const r = await httpText("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tav}` }, body: JSON.stringify({ query: q, max_results: k }), timeoutMs: 20000 });
        if (r.status === 200) { const j = JSON.parse(r.text) as { results?: { title: string; url: string; content: string }[] }; return { provider: "tavily", results: (j.results ?? []).slice(0, k).map((x) => ({ title: x.title, url: x.url, snippet: x.content.slice(0, 300) })) }; }
      } catch { /* next provider */ }
    }
    if (brave) {
      try {
        const j = await httpJson<{ web?: { results?: { title: string; url: string; description: string }[] } }>(`https://api.search.brave.com/res/v1/web/search?count=${k}&q=${encodeURIComponent(q)}`, { headers: { "X-Subscription-Token": brave }, timeoutMs: 15000 });
        return { provider: "brave", results: (j.web?.results ?? []).slice(0, k).map((x) => ({ title: strip(x.title), url: x.url, snippet: strip(x.description ?? "").slice(0, 300) })) };
      } catch { /* next provider */ }
    }
    for (const [url, opts] of [
      [`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {}],
      ["https://html.duckduckgo.com/html/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `q=${encodeURIComponent(q)}` }],
    ] as [string, Parameters<typeof httpText>[1]][]) {
      const r = await httpText(url, { ...opts, headers: { Accept: "text/html", "Accept-Language": "en", ...(opts?.headers ?? {}) }, timeoutMs: 15000 }).catch(() => null);
      if (r?.status === 200) { const res = parseDdg(r.text).slice(0, k); if (res.length) return { provider: "duckduckgo", results: res }; }
    }
    throw new ToolError("Web search is unavailable right now (DuckDuckGo blocked or returned nothing; set TAVILY_API_KEY or BRAVE_API_KEY for a reliable provider).");
  });
}

export async function readPage(url: string): Promise<{ url: string; text: string; truncated: boolean }> {
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new ToolError("read_page needs a full http(s) URL.");
  const text = await diskCached("jina", url, 6 * 3600_000, async () => {
    const r = await httpText("https://r.jina.ai/" + url, { headers: { Accept: "text/plain" }, timeoutMs: 30000 });
    if (r.status !== 200 || !r.text.trim()) throw new ToolError(`Could not read ${url} (reader HTTP ${r.status}).`);
    return r.text;
  });
  return { url, text: text.slice(0, 6000), truncated: text.length > 6000 };
}

export interface WikiInfo { title: string; description?: string; summary: string; url: string; lat?: number; lon?: number; population?: { value: number; year?: string }; wikidata?: string }
export async function wikiLookup(place: string): Promise<WikiInfo> {
  return diskCached("wiki", place.toLowerCase(), 7 * 86400_000, async () => {
    type Sum = { title: string; description?: string; extract?: string; content_urls?: { desktop?: { page?: string } }; coordinates?: { lat: number; lon: number }; wikibase_item?: string; type?: string };
    const get = (t: string) => httpJson<Sum>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, "_"))}?redirect=true`, { timeoutMs: 12000 });
    let s: Sum | null = await get(place).catch(() => null);
    if (!s || s.type === "disambiguation") {
      const found = await httpJson<{ query?: { search?: { title: string }[] } }>(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(place)}`, { timeoutMs: 12000 }).catch(() => null);
      const t = found?.query?.search?.[0]?.title;
      s = t ? await get(t).catch(() => null) : null;
    }
    if (!s) throw new ToolError(`No Wikipedia article found for "${place}".`);
    const info: WikiInfo = { title: s.title, description: s.description, summary: (s.extract ?? "").slice(0, 900), url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title)}`, lat: s.coordinates?.lat, lon: s.coordinates?.lon, wikidata: s.wikibase_item };
    if (s.wikibase_item) {
      const wd = await httpJson<{ claims?: { P1082?: { rank?: string; mainsnak?: { datavalue?: { value?: { amount?: string } } }; qualifiers?: { P585?: { datavalue?: { value?: { time?: string } } }[] } }[] } }>(
        `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P1082&entity=${s.wikibase_item}`, { timeoutMs: 10000 }).catch(() => null);
      const claims = (wd?.claims?.P1082 ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.datavalue?.value?.amount);
      claims.sort((a, b) => (b.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? "").localeCompare(a.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? ""));
      const c = claims[0];
      if (c) info.population = { value: Math.round(+c.mainsnak!.datavalue!.value!.amount!), year: c.qualifiers?.P585?.[0]?.datavalue?.value?.time?.slice(1, 5) };
    }
    return info;
  });
}
