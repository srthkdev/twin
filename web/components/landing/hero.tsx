"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDataset } from "@/hooks/use-dataset";
import { Combobox } from "@/components/combobox";
import type { GlobeArc } from "@/components/map/landing-globe";
import type { DataSet } from "@/lib/types";
import { ProofStrip } from "./proof-strip";
import { reportHref, ROLES } from "./report-links";
import { cn } from "@/lib/utils";

const LandingGlobe = dynamic(() => import("@/components/map/landing-globe"), { ssr: false });

const PRIORITY = [
  ["los-angeles-silver-lake", "berlin"], ["new-york-williamsburg", "london"], ["mexico-city-roma-norte", "paris"],
  ["london-shoreditch", "new-york"], ["paris-le-marais", "los-angeles"], ["berlin-neukolln-reuterkiez", "mexico-city"],
  ["los-angeles-beverly-hills", "paris"], ["london-brixton", "new-york"],
] as const;

function buildArcs(ds: DataSet): GlobeArc[] {
  const hood = (id: string) => ds.hoods.find((h) => h.id === id);
  const out: GlobeArc[] = [];
  const seen = new Set<string>();
  const add = (aId: string, city: string) => {
    const a = hood(aId), t = ds.twins[aId]?.[city]?.[0];
    const b = t && hood(t.hood);
    if (!a || !b || seen.has(a.city + b.city)) return;
    seen.add(a.city + b.city);
    out.push({ from: [a.lon, a.lat], to: [b.lon, b.lat], fromName: a.name, toName: b.name, score: t.score });
  };
  for (const [a, c] of PRIORITY) add(a, c);
  const rest = Object.entries(ds.twins).flatMap(([a, byCity]) => Object.entries(byCity).map(([c, m]) => ({ a, c, s: m[0]?.score ?? 0 }))).sort((x, y) => y.s - x.s);
  for (const r of rest) { if (out.length >= 10) break; add(r.a, r.c); }
  return out;
}

export function Hero() {
  const { ds, error } = useDataset();
  const router = useRouter();
  const [task, setTask] = useState<(typeof ROLES)[number]["id"]>("open");
  const [hood, setHood] = useState("");
  const [city, setCity] = useState("berlin");
  const [kind, setKind] = useState("natural wine bar");
  const [concept, setConcept] = useState("café");
  const [artist, setArtist] = useState("Peso Pluma");
  const arcs = useMemo(() => (ds ? buildArcs(ds) : []), [ds]);
  const hoodOpts = useMemo(() => ds?.hoods.map((h) => ({ value: h.id, label: h.name, group: ds.cities.find((c) => c.id === h.city)?.name })) ?? [], [ds]);
  const cityOpts = useMemo(() => ds?.cities.map((c) => ({ value: c.id, label: c.name, group: undefined })) ?? [], [ds]);
  const source = ds?.hoods.find((h) => h.id === hood)
    ?? ds?.hoods.find((h) => h.id === (task === "expand" ? "london-shoreditch" : "los-angeles-silver-lake")) ?? ds?.hoods[0];
  const target = ds?.cities.find((c) => c.id === city) ?? ds?.cities[0];
  const sourceName = source ? `${source.name}, ${ds?.cities.find((c) => c.id === source.city)?.name ?? source.city}` : "";
  const sameCity = (task === "expand" || task === "move") && source?.city === target?.id;
  const ready = !!ds && !sameCity && (task === "tour" ? !!artist.trim() : !!target && (task === "open" ? !!kind.trim() : !!source && (task !== "expand" || !!concept.trim())));
  const go = () => {
    if (!ready) return;
    const question = task === "open" ? `Where in ${target!.name} should I open a ${kind.trim()}?`
      : task === "expand" ? `My ${concept.trim()} works in ${sourceName}. Where in ${target!.name} should I open the next one?`
        : task === "move" ? `I love ${sourceName}. I'm moving to ${target!.name}. Which neighbourhood should I choose and where should I go?`
          : `Where should ${artist.trim()} play in Europe? Recommend cities, neighbourhoods and venues for a three-city tour.`;
    router.push(reportHref(question));
  };
  const cityField = <Combobox ariaLabel="Destination city" value={target?.id ?? ""} onChange={setCity} options={cityOpts} placeholder="city" searchPlaceholder="find a city…" className="max-w-full" />;
  const hoodField = <Combobox ariaLabel="Neighbourhood you know" value={source?.id ?? ""} onChange={setHood} options={hoodOpts} placeholder="neighbourhood" searchPlaceholder="find a neighbourhood…" className="max-w-full" />;
  const inputClass = "min-w-0 max-w-full border-b border-dashed border-line-strong bg-transparent pb-px text-foreground outline-none hover:border-primary focus:border-primary";

  return (
    <section className="grid min-h-[calc(100svh-44px)] border-b border-line pt-11 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col justify-between gap-6 px-5 py-8 sm:px-10 lg:py-10">
        <div className="label">qloo taste data · a decision you can act on</div>

        <div>
          <h1 className="max-w-[24ch] text-balance text-[clamp(32px,3.4vw,48px)] font-medium leading-[1.03] tracking-[-0.055em]">
            Find what works in one neighbourhood <span className="text-primary">—</span> and where it works next.
          </h1>
          <p className="mt-4 max-w-[66ch] text-[13px] leading-relaxed text-muted-foreground">
            Twin reads Qloo&apos;s taste data block by block, corrects it for how busy a place is, and matches neighbourhoods
            across cities. An agent turns that into a decision: where to open, where to expand, where to move, where to play
            — as a report with a verdict, charts and the evidence behind every number.
          </p>

          <div className="mt-6 max-w-xl border border-line-strong bg-card">
            <div role="tablist" aria-label="What do you want to do?" className="grid grid-cols-[1.45fr_1fr_1fr_1fr] border-b border-line text-[11px] sm:text-[12px]">
              {ROLES.map((role) => <button key={role.id} type="button" role="tab" id={`task-${role.id}`} aria-controls="task-panel" aria-selected={task === role.id}
                tabIndex={task === role.id ? 0 : -1}
                onClick={() => setTask(role.id)}
                onKeyDown={(e) => {
                  const index = ROLES.findIndex((r) => r.id === task);
                  const next = e.key === "ArrowRight" ? (index + 1) % ROLES.length : e.key === "ArrowLeft" ? (index + ROLES.length - 1) % ROLES.length : e.key === "Home" ? 0 : e.key === "End" ? ROLES.length - 1 : -1;
                  if (next < 0) return;
                  e.preventDefault(); setTask(ROLES[next].id); document.getElementById(`task-${ROLES[next].id}`)?.focus();
                }}
                className={cn("whitespace-nowrap px-1 py-2.5 transition-colors sm:px-2", task === role.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-raised hover:text-foreground")}>
                {role.label}
              </button>)}
            </div>
            <div role="tabpanel" id="task-panel" aria-labelledby={`task-${task}`}>
              <form onSubmit={(e) => { e.preventDefault(); go(); }}>
                <div className="flex min-h-20 flex-wrap items-baseline gap-x-2 gap-y-3 px-4 py-4 text-[14px] leading-relaxed text-muted-foreground">
                  {task === "open" ? <><span>Where in</span>{cityField}<span>should I open a</span><input aria-label="Kind of business" required value={kind} onChange={(e) => setKind(e.target.value)} maxLength={120} className={cn(inputClass, "w-[18ch]")} /><span>?</span></>
                    : task === "expand" ? <><span>My</span><input aria-label="Business that works" required value={concept} onChange={(e) => setConcept(e.target.value)} maxLength={120} className={cn(inputClass, "w-[9ch]")} /><span>works in</span>{hoodField}<span>. Where is that in</span>{cityField}<span>?</span></>
                      : task === "move" ? <><span>I love</span>{hoodField}<span>. I&apos;m moving to</span>{cityField}<span>.</span></>
                        : <><span>Where should</span><input aria-label="Artist to tour" required value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={120} className={cn(inputClass, "w-[14ch]")} /><span>play in Europe?</span></>}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-3">
                  <p className="text-[11px] leading-relaxed text-dim" aria-live="polite">{error ? "Could not load the city and neighbourhood list." : !ds ? "Loading cities and neighbourhoods…" : sameCity ? "Choose a different destination city." : "A live report, built from real tool results."}</p>
                  <button type="submit" disabled={!ready} className="shrink-0 bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30">build report →</button>
                </div>
              </form>
            </div>
          </div>

          <Link href="/explore" className="link mt-4 inline-block text-[12px] text-muted-foreground">or just explore the map →</Link>
        </div>

        <ProofStrip />
      </div>

      <figure className="relative hidden border-l border-line lg:block">
        <div className="absolute inset-0"><LandingGlobe arcs={arcs} /></div>
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between border-t border-line bg-background/80 px-4 py-2 text-[11px] text-dim">
          <span>fig. 1 — strongest twin per city pair</span>
          <span className="num">{arcs.length} arcs</span>
        </figcaption>
        <span className="pointer-events-none absolute left-4 top-3 text-[11px] text-dim">neighbourhood matches / qloo</span>
      </figure>
    </section>
  );
}
