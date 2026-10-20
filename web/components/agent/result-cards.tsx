"use client";
import { cn } from "@/lib/utils";

/* Visual summaries of tool results, so the chat text can stay short and human. Every card reads only the tool's own output. */

type Any = Record<string, unknown>;
const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const str = (x: unknown) => (typeof x === "string" ? x : "");
const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);
const pct = (c: number | null) => (c == null ? "–" : `${Math.round(c * 100)}%`);

/** "los-angeles-silver-lake" → "Silver Lake" for display when only an id is available. */
export function prettyPlace(id: string) {
  const cities = ["los-angeles", "new-york", "mexico-city", "london", "berlin", "paris", "lisbon", "madrid"];
  let s = id;
  for (const c of cities) if (s.startsWith(c + "-")) { s = s.slice(c.length + 1); break; }
  return s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function Shell({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="my-2 border border-line bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-2.5 py-1.5">
        <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
        {meta && <span className="truncate text-[10.5px] text-dim">{meta}</span>}
      </div>
      <div className="px-2.5 py-2">{children}</div>
    </div>
  );
}
function Bar({ v, max = 1, tone = "accent" }: { v: number; max?: number; tone?: "accent" | "fg" | "dim" }) {
  const w = Math.max(2, Math.min(100, (v / (max || 1)) * 100));
  return (
    <span className="relative block h-1.5 w-full bg-line">
      <span className={cn("absolute inset-y-0 left-0", tone === "accent" ? "bg-primary" : tone === "fg" ? "bg-foreground/70" : "bg-dim")} style={{ width: `${w}%` }} />
    </span>
  );
}
function Chips({ items, accent }: { items: string[]; accent?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t) => <span key={t} className={cn("border px-1.5 py-0.5 text-[10.5px]", accent ? "border-primary/50 text-primary" : "border-line text-muted-foreground")}>{t}</span>)}
    </div>
  );
}

function Twins({ d }: { d: Any }) {
  const rows = arr<Any>(d.twins).map((t) => ({
    name: str(t.name), score: num(t.cosine_similarity) ?? num(t.cosine),
    shared: arr<Any | string>(t.shared_traits ?? t.shared).map((x) => (typeof x === "string" ? x : str((x as Any).trait))).filter(Boolean),
  }));
  if (!rows.length) return null;
  const target = str(d.target_city) || str((d as Any).target_city);
  return (
    <Shell title={`twins in ${prettyPlace(target)}`} meta="% match on corrected taste">
      <ol className="space-y-1.5">
        {rows.slice(0, 5).map((r, i) => (
          <li key={r.name}>
            <div className="grid grid-cols-[1.1rem_minmax(0,1fr)_5rem_2.6rem] items-center gap-2 text-[11.5px]">
              <span className={i === 0 ? "text-primary" : "text-dim"}>{i + 1}</span>
              <span className={cn("truncate", i === 0 ? "text-foreground" : "text-muted-foreground")}>{r.name}</span>
              <Bar v={r.score ?? 0} tone={i === 0 ? "accent" : "fg"} />
              <span className="num text-right text-muted-foreground">{pct(r.score)}</span>
            </div>
            {i === 0 && r.shared.length > 0 && <div className="mt-1.5 pl-[1.6rem]"><Chips items={r.shared.slice(0, 5)} accent /></div>}
          </li>
        ))}
      </ol>
    </Shell>
  );
}

function Match({ d }: { d: Any }) {
  const a = str((d.a as Any)?.name), b = str((d.b as Any)?.name);
  const shared = arr<Any>(d.shared_traits).map((x) => str(x.trait)).filter(Boolean);
  const diff = arr<Any>(d.diverging_traits).map((x) => `${str(x.trait)} (${(num(x.z_a) ?? 0) > (num(x.z_b) ?? 0) ? a : b})`);
  return (
    <Shell title={`${a} × ${b}`} meta={`${pct(num(d.cosine_similarity))} match`}>
      <div className="space-y-2 text-[11px]">
        <div><div className="mb-1 text-dim">both love</div><Chips items={shared.slice(0, 6)} accent /></div>
        {diff.length > 0 && <div><div className="mb-1 text-dim">where they differ</div><Chips items={diff.slice(0, 4)} /></div>}
      </div>
    </Shell>
  );
}

function Places({ d }: { d: Any }) {
  const where = str((d.where as Any)?.name);
  const places = arr<Any>(d.place);
  const artists = arr<Any>(d.artist).map((x) => str(x.name)).filter(Boolean);
  const brands = arr<Any>(d.brand).map((x) => str(x.name)).filter(Boolean);
  if (!places.length && !artists.length && !brands.length) return null;
  const today = new Date().toLocaleDateString("en", { weekday: "short" });
  return (
    <Shell title={`in ${where || "the area"}`} meta="picked by qloo for this taste">
      {places.length > 0 && (
        <ul className="grid gap-1.5">
          {places.slice(0, 5).map((p) => {
            const hrs = str(p.hours).split("; ").find((h) => h.startsWith(today)) ?? "";
            return (
              <li key={str(p.name)} className="border-l-2 border-primary/60 pl-2">
                <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                  <span className="truncate text-foreground">{str(p.name)}</span>
                  {num(p.qloo_affinity) != null && <span className="num shrink-0 text-[10.5px] text-primary">{pct(num(p.qloo_affinity))} fit</span>}
                </div>
                <div className="truncate text-[10.5px] text-dim">{[str(p.address).split(",")[0], hrs && `today ${hrs.replace(/^\w+ /, "")}`].filter(Boolean).join(" · ")}</div>
              </li>
            );
          })}
        </ul>
      )}
      {(artists.length > 0 || brands.length > 0) && (
        <div className="mt-2 space-y-1.5 text-[11px]">
          {artists.length > 0 && <div><span className="mr-1.5 text-dim">sound</span><Chips items={artists.slice(0, 5)} /></div>}
          {brands.length > 0 && <div><span className="mr-1.5 text-dim">brands</span><Chips items={brands.slice(0, 5)} /></div>}
        </div>
      )}
    </Shell>
  );
}

function Gaps({ d }: { d: Any }) {
  const rows = arr<Any>(d.top_opportunities).slice(0, 5);
  if (!rows.length) return null;
  const maxD = Math.max(...rows.map((r) => num(r.demand) ?? 0), 1);
  return (
    <Shell title={`where to open · ${str(d.taste)}`} meta={`${str(d.supply_kind).replace(/_/g, " ")} supply: ${str(d.supply_source).split(" 20")[0] || "open data"}`}>
      <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_5rem_3.2rem] gap-2 text-[10px] text-dim"><span>near</span><span>demand</span><span className="text-right">existing</span></div>
      <ol className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_3.2rem] items-center gap-2 text-[11.5px]">
            <span className={cn("truncate", i === 0 ? "text-foreground" : "text-muted-foreground")}>{str(r.near) || "unnamed area"}</span>
            <Bar v={num(r.demand) ?? 0} max={maxD} />
            <span className={cn("num text-right", (num(r.supply) ?? 0) === 0 ? "text-primary" : "text-muted-foreground")}>{num(r.supply) ?? "–"}</span>
          </li>
        ))}
      </ol>
    </Shell>
  );
}

function Tour({ d }: { d: Any }) {
  const cities = arr<Any>(d.cities).filter((c) => !c.error);
  if (!cities.length) return null;
  const maxR = Math.max(...cities.map((c) => (num(c.reach) ?? 0) * (num(c.top_cell_affinity) ?? 0)), 0.0001);
  return (
    <Shell title={`tour · ${str(d.artist)}`} meta="ordered by where fans are">
      <ol className="space-y-2">
        {cities.map((c, i) => (
          <li key={str(c.city)}>
            <div className="grid grid-cols-[1.1rem_6rem_minmax(0,1fr)] items-center gap-2 text-[11.5px]">
              <span className={i === 0 ? "text-primary" : "text-dim"}>{i + 1}</span>
              <span className="truncate text-foreground">{str(c.city)}</span>
              <Bar v={(num(c.reach) ?? 0) * (num(c.top_cell_affinity) ?? 0)} max={maxR} tone={i === 0 ? "accent" : "fg"} />
            </div>
            <div className="mt-0.5 truncate pl-[1.6rem] text-[10.5px] text-dim">
              {arr<string>(c.strongest_neighbourhoods).slice(0, 3).join(" · ")}
              {arr<Any>(c.venues_near_strongest)[0] ? ` — play ${str(arr<Any>(c.venues_near_strongest)[0].name)}` : ""}
            </div>
          </li>
        ))}
      </ol>
    </Shell>
  );
}

function Scene({ d }: { d: Any }) {
  return (
    <Shell title={`the scene · ${str(d.place)}`} meta="what it over-indexes on (qloo)">
      <div className="space-y-1.5 text-[11px]">
        <Chips items={arr<string>(d.place_types).slice(0, 8)} accent />
        {arr<string>(d.artists).length > 0 && <div><span className="mr-1.5 text-dim">sound</span><Chips items={arr<string>(d.artists).slice(0, 6)} /></div>}
        {arr<string>(d.brands).length > 0 && <div><span className="mr-1.5 text-dim">brands</span><Chips items={arr<string>(d.brands).slice(0, 6)} /></div>}
        {arr<string>(d.audiences).length > 0 && <div><span className="mr-1.5 text-dim">people</span><Chips items={arr<string>(d.audiences).slice(0, 6)} /></div>}
      </div>
    </Shell>
  );
}

function Trend({ d }: { d: Any }) {
  const pts = arr<Any>(d.points).map((p) => num(p.percentile) ?? 0);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts), hi = Math.max(...pts), W = 220, H = 36;
  const xy = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - lo) / (hi - lo || 1)) * (H - 4) - 2}`).join(" ");
  const dir = str(d.direction);
  return (
    <Shell title={`momentum · ${str(d.item)}`} meta={dir}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-full" preserveAspectRatio="none" aria-label={`${str(d.item)} is ${dir}`}>
        <polyline points={xy} fill="none" stroke={dir === "fading" ? "var(--muted-foreground)" : "var(--primary)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </Shell>
  );
}

function Supply({ d }: { d: Any }) {
  const counts = Object.entries((d.counts as Record<string, number>) ?? {});
  if (!counts.length) return null;
  const max = Math.max(...counts.map(([, v]) => v), 1);
  return (
    <Shell title="what exists nearby" meta={str(d.source).split(" 20")[0]}>
      <ul className="space-y-1">
        {counts.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.2rem] items-center gap-2 text-[11px]">
            <span className="truncate text-muted-foreground">{k.replace(/_/g, " ")}</span><Bar v={v} max={max} tone="fg" /><span className="num text-right text-foreground">{v}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function Wiki({ d }: { d: Any }) {
  return (
    <Shell title={str(d.title)} meta={(d.population as Any)?.value ? `pop ${Number((d.population as Any).value).toLocaleString("en")}` : "wikipedia"}>
      <p className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{str(d.summary)}</p>
      <a href={str(d.url)} target="_blank" rel="noreferrer" className="link mt-1 inline-block text-[10.5px] text-dim">wikipedia ↗</a>
    </Shell>
  );
}

function Web({ d }: { d: Any }) {
  const rows = arr<Any>(d.results).slice(0, 4);
  if (!rows.length) return null;
  return (
    <Shell title="from the web" meta={str(d.provider)}>
      <ul className="space-y-1">
        {rows.map((r) => <li key={str(r.url)} className="truncate text-[11px]"><a href={str(r.url)} target="_blank" rel="noreferrer" className="link text-muted-foreground">{str(r.title)}</a></li>)}
      </ul>
    </Shell>
  );
}

function City({ d }: { d: Any }) {
  const c = d.city as Any;
  if (!c) return null;
  return (
    <Shell title={`${str(c.name)} fingerprinted`} meta={str(c.country)}>
      <div className="text-[11px] text-muted-foreground"><span className="num text-foreground">{num(c.cells)}</span> blocks · <span className="num text-foreground">{num(c.neighbourhoods)}</span> neighbourhoods · now on the map</div>
    </Shell>
  );
}

const CARDS: Record<string, (p: { d: Any }) => React.ReactNode> = {
  find_twins: Twins, twins_anywhere: Twins, explain_match: Match, local_scene: Places, opportunity: Gaps, tour: Tour,
  scene: Scene, trend: Trend, venue_supply: Supply, wiki: Wiki, web_search: Web, add_city: City,
};
export const hasCard = (name: string) => name in CARDS;
export function ResultCard({ name, data }: { name: string; data: unknown }) {
  const C = CARDS[name];
  if (!C || !data || typeof data !== "object") return null;
  return <C d={data as Any} />;
}

/** A plain-language label for a tool step. */
export function stepLabel(name: string, a: Any = {}): string {
  const p = (k: string) => prettyPlace(str(a[k]));
  switch (name) {
    case "find_twins": return `Matching ${p("hood_id")} with ${p("target_city")}`;
    case "twins_anywhere": return `Matching ${p("source")} with ${p("target_city")}`;
    case "explain_match": return `Comparing ${p("hood_a")} and ${p("hood_b")}`;
    case "compare_taste": return `Comparing ${p("a")} and ${p("b")}`;
    case "taste_profile": return `Reading ${p("hood_id")}'s taste`;
    case "local_scene": return `Finding places in ${p("hood_id")}`;
    case "scene": return `Reading the scene in ${str(a.place)}`;
    case "opportunity": return `Demand vs supply: ${str(a.taste)} in ${p("city")}`;
    case "tour": return `Routing a tour for ${str(a.artist)}`;
    case "trend": return `Checking ${str(a.item)}'s momentum`;
    case "audience": return `Who listens to ${str(a.item_label)}`;
    case "cross_domain": return `What ${str(a.item_label)} fans like`;
    case "where_in_city": return `Where ${str(a.item_or_group)} fans are in ${p("city")}`;
    case "venue_supply": return `Counting venues near ${str(a.place) || "the spot"}`;
    case "add_city": return `Fingerprinting ${str(a.name)}`;
    case "list_cities": return "Checking which cities exist";
    case "search_hoods": return `Looking up "${str(a.query)}"`;
    case "geocode": return `Locating ${str(a.query)}`;
    case "wiki": return `Background on ${str(a.place)}`;
    case "web_search": return `Searching the web`;
    case "read_page": return `Reading a page`;
    case "pin_twins": return "Matching your pin";
    case "brief": return "Writing your brief";
    default: return name.replace(/_/g, " ");
  }
}
