"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDataset } from "@/hooks/use-dataset";
import { Combobox } from "@/components/combobox";
import type { GlobeArc } from "@/components/map/landing-globe";
import type { DataSet } from "@/lib/types";

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

const QUICK = [
  ["los-angeles-silver-lake", "berlin", "silver lake → berlin"],
  ["new-york-williamsburg", "london", "williamsburg → london"],
  ["mexico-city-roma-norte", "paris", "roma norte → paris"],
] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

export function Hero() {
  const { ds } = useDataset();
  const router = useRouter();
  const [hood, setHood] = useState("los-angeles-silver-lake");
  const [city, setCity] = useState("berlin");
  const arcs = useMemo(() => (ds ? buildArcs(ds) : []), [ds]);
  const hoodOpts = useMemo(() => ds?.hoods.map((h) => ({ value: h.id, label: h.name, group: ds.cities.find((c) => c.id === h.city)?.name })) ?? [], [ds]);
  const cityOpts = useMemo(() => ds?.cities.map((c) => ({ value: c.id, label: c.name, group: undefined })) ?? [], [ds]);
  const go = (h = hood, c = city) => router.push(`/explore?from=${h}&to=${c}`);
  const sourceCity = ds?.hoods.find((h) => h.id === hood)?.city;
  const sameCity = sourceCity === city;
  const top = ds?.twins[hood]?.[city]?.[0];
  const topName = top && ds?.hoods.find((h) => h.id === top.hood)?.name;

  return (
    <section className="grid min-h-[calc(100svh-44px)] border-b border-line pt-11 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="flex flex-col justify-between gap-12 px-5 py-10 sm:px-10 lg:py-14">
        <div className="label">qloo taste data · {ds ? pad2(ds.cities.length) : "--"} cities · 1 km cells</div>

        <div>
          <h1 className="text-[clamp(38px,6.2vw,76px)] font-medium leading-[0.98] tracking-[-0.055em]">
            every neighbourhood<br />has a twin<span className="text-primary">.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
            Twin reads Qloo&apos;s taste data for every square kilometre of a city — which artists, brands, food and nightlife
            over-index there — removes the popularity baseline that makes every busy block look alike, and finds the place
            in another city with the same fingerprint.
          </p>

          <div className="mt-10 max-w-xl border border-line-strong bg-card">
            <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
              <span className="label">query</span>
              <span className="text-[11px] text-dim">↵ to run</span>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); if (!sameCity) go(); }}
              className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3 text-[15px]"
            >
              <span className="text-dim">&gt;</span>
              <span className="text-muted-foreground">find the</span>
              {ds ? (
                <Combobox ariaLabel="Source neighbourhood" value={hood} onChange={setHood} options={hoodOpts} placeholder="neighbourhood" searchPlaceholder="any neighbourhood…" />
              ) : <span className="text-dim">…</span>}
              <span className="text-muted-foreground">of</span>
              {ds ? (
                <Combobox ariaLabel="Target city" value={city} onChange={setCity} options={cityOpts} placeholder="city" searchPlaceholder="city…" />
              ) : <span className="text-dim">…</span>}
              <button
                type="submit" disabled={!ds || sameCity}
                className="ml-auto bg-primary px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                run
              </button>
            </form>
            <div className="flex min-h-9 items-center border-t border-line px-3 py-2 text-[12px]">
              {sameCity ? (
                <span className="text-primary">pick a different city than the neighbourhood&apos;s own</span>
              ) : top && topName ? (
                <span className="text-muted-foreground">
                  top match <span className="text-foreground">{topName}</span>
                  <span className="num ml-2 text-primary">{top.score.toFixed(2)}</span>
                  <span className="ml-1 text-dim">cosine</span>
                </span>
              ) : <span className="text-dim">—</span>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-dim">
            <span>try</span>
            {QUICK.map(([h, c, l]) => (
              <button key={l} onClick={() => go(h, c)} className="link text-muted-foreground">{l}</button>
            ))}
          </div>
        </div>

        <dl className="grid max-w-xl grid-cols-3 border-t border-line pt-4">
          {[[ds?.cities.length, "cities"], [ds?.basket.length, "taste dims"], [ds?.hoods.length, "neighbourhoods"]].map(([n, l]) => (
            <div key={l as string}>
              <dt className="label">{l}</dt>
              <dd className="num mt-1 text-[22px] tracking-tight">{n ?? "--"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <figure className="relative hidden border-l border-line lg:block">
        <div className="absolute inset-0"><LandingGlobe arcs={arcs} /></div>
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between border-t border-line bg-background/80 px-4 py-2 text-[11px] text-dim">
          <span>fig. 1 — strongest twin per city pair</span>
          <span className="num">{arcs.length} arcs</span>
        </figcaption>
        <span className="pointer-events-none absolute left-4 top-3 text-[11px] text-dim">globe / live</span>
      </figure>
    </section>
  );
}
