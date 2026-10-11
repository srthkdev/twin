"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useDataset } from "@/hooks/use-dataset";
import { Combobox } from "@/components/combobox";
import { Skeleton } from "@/components/ui/skeleton";
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
  ["los-angeles-silver-lake", "berlin", "Silver Lake → Berlin"],
  ["new-york-williamsburg", "london", "Williamsburg → London"],
  ["mexico-city-roma-norte", "paris", "Roma Norte → Paris"],
] as const;

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
  const stats = ds ? [[ds.cities.length, "cities"], [ds.basket.length, "taste dimensions"], [ds.hoods.length, "neighbourhoods"]] : [];

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col items-center overflow-hidden px-4 pt-28 sm:pt-32">
      <div className="absolute inset-0 -z-10"><LandingGlobe arcs={arcs} /></div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_36%_at_50%_34%,rgba(7,8,11,.6),rgba(7,8,11,.12)_70%,transparent),linear-gradient(to_bottom,transparent_75%,#07080b)]" />

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="glass mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-white/80">
        <Sparkles className="size-3.5 text-cyan-300" /> Powered by Qloo taste data · corrected for popularity bias
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.08 }}
        className="max-w-4xl text-balance text-center text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-7xl lg:text-[88px]">
        Every neighbourhood has a <span className="text-gradient">twin.</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.18 }}
        className="mt-6 max-w-2xl text-balance text-center text-base text-white/70 sm:text-lg">
        Silver Lake&apos;s cultural twin is Neukölln (<span className="font-mono text-white">0.77</span>) — not Mitte. Twin reads Qloo&apos;s taste signals across artists, brands and places,
        strips out the popularity bias, and matches the fingerprint of any block to any other city.
      </motion.p>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}
        className="glass glow-ring mt-10 flex w-full max-w-3xl flex-col items-stretch gap-3 rounded-3xl p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-3 sm:p-4">
        <span className="px-2 text-lg font-medium text-white/70 sm:text-2xl">Find the</span>
        {ds ? (
          <>
            <Combobox ariaLabel="Source neighbourhood" value={hood} onChange={setHood} options={hoodOpts} placeholder="neighbourhood" searchPlaceholder="Search any neighbourhood…" className="text-lg sm:text-2xl" />
            <span className="px-2 text-lg font-medium text-white/70 sm:text-2xl">of</span>
            <Combobox ariaLabel="Target city" value={city} onChange={setCity} options={cityOpts} placeholder="city" searchPlaceholder="Search cities…" className="text-lg sm:text-2xl" />
            <button
              onClick={() => go()} disabled={sameCity}
              className="bg-gradient-accent group ml-0 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold text-black shadow-[0_0_40px_-6px_rgba(34,211,238,.7)] transition hover:scale-[1.03] disabled:opacity-40 sm:ml-2"
            >
              Find twin <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </button>
          </>
        ) : (
          <Skeleton className="h-12 w-full max-w-md rounded-xl bg-white/10" />
        )}
      </motion.div>
      {sameCity && <p className="mt-2 text-xs text-amber-300">Pick a target city different from the neighbourhood&apos;s own.</p>}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-5 flex flex-wrap justify-center gap-2">
        {QUICK.map(([h, c, l]) => (
          <button key={l} onClick={() => go(h, c)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 transition hover:border-violet-400/60 hover:text-white">
            {l}
          </button>
        ))}
      </motion.div>

      <div className="mt-auto flex w-full max-w-3xl justify-around gap-4 pb-10 pt-16">
        {stats.map(([n, l]) => (
          <div key={l} className="text-center">
            <div className="font-mono text-3xl font-medium tabular-nums sm:text-4xl">{n}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-white/50">{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
