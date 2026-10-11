"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis, Area, AreaChart, Scatter, ScatterChart, ZAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/animated-number";
import { loadEvals, loadHoods } from "@/lib/data";
import { cosine } from "@/lib/similarity";
import { CITY_CODES } from "@/lib/groups";
import { cn } from "@/lib/utils";
import type { Evals, Hood, MethodKey } from "@/lib/types";

const INK = { accent: "#f0a03c", fg: "#e6e3da", muted: "#8d8a80", dim: "#5f5c55", grid: "#2a2925" };
const COLORS: Record<MethodKey, string> = { twin: INK.accent, llm: INK.fg, raw: INK.muted, random: INK.dim };
const NAMES: Record<MethodKey, string> = { twin: "Twin", llm: "LLM only", raw: "Raw Qloo", random: "Random" };
const METHODS: MethodKey[] = ["twin", "llm", "raw", "random"];
const config: ChartConfig = Object.fromEntries(METHODS.map((m) => [m, { label: NAMES[m], color: COLORS[m] }]));
const tick = { fill: INK.dim, fontSize: 11, fontFamily: "var(--font-geist-mono)" };
const f2 = (x?: number) => (x == null ? "--" : x.toFixed(2));

function Panel({ title, sub, children, className }: { title: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5 }} className={cn("panel p-5 sm:p-6", className)}>
      <h2 className="text-[15px] font-medium tracking-[-0.02em] text-foreground">{title}</h2>
      {sub && <p className="mt-1.5 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">{sub}</p>}
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

function RankChip({ rank }: { rank: number }) {
  const tone = rank === 1 ? "border-primary bg-primary text-primary-foreground" : rank <= 3 ? "border-primary/60 text-primary" : "border-line text-dim";
  return <span className={cn("inline-flex min-w-9 justify-center border px-1.5 py-0.5 text-[11px] tabular-nums", tone)}>{Number.isInteger(rank) ? rank : rank.toFixed(1)}</span>;
}

function Kpi({ label, value, decimals = 2, suffix = "", note, accent }: { label: string; value: number | null; decimals?: number; suffix?: string; note: React.ReactNode; accent?: boolean }) {
  return (
    <div className="panel p-5">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className={cn("num mt-3 text-[44px] leading-none tracking-tight", accent ? "text-primary" : "text-foreground")}>
        {value == null ? "--" : <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />}
      </div>
      <div className="mt-4 text-[11.5px] leading-relaxed text-dim">{note}</div>
    </div>
  );
}

export function EvalsClient() {
  const [ev, setEv] = useState<Evals | null>(null);
  const [hoods, setHoods] = useState<Hood[]>([]);
  const [split, setSplit] = useState<"test" | "dev" | "all">("test");
  const [sk, setSk] = useState<string | null>(null);
  useEffect(() => { loadEvals().then(setEv).catch(() => {}); loadHoods().then(setHoods).catch(() => {}); }, []);
  const name = useMemo(() => new Map(hoods.map((h) => [h.id, h.name])), [hoods]);
  const cityOf = useMemo(() => new Map(hoods.map((h) => [h.id, h.city])), [hoods]);

  const bars = useMemo(() => ev ? [
    { metric: "hit@1", ...Object.fromEntries(METHODS.map((m) => [m, ev.methods[m].hit1])) },
    { metric: "hit@3", ...Object.fromEntries(METHODS.map((m) => [m, ev.methods[m].hit3])) },
    { metric: "MRR", ...Object.fromEntries(METHODS.map((m) => [m, ev.methods[m].mrr])) },
  ] : [], [ev]);

  // Corrected cross-city cosines, computed live from the shipped neighbourhood vectors.
  const hist = useMemo(() => {
    if (hoods.length < 4) return [];
    const bins = Array.from({ length: 30 }, (_, k) => ({ x: +(-0.5 + (k + 0.5) * 0.05).toFixed(3), twin: 0 }));
    let tot = 0;
    for (let i = 0; i < hoods.length; i++) for (let j = i + 1; j < hoods.length; j++) {
      if (hoods[i].city === hoods[j].city) continue;
      bins[Math.min(29, Math.max(0, Math.floor((cosine(hoods[i].v, hoods[j].v) + 0.5) / 0.05)))].twin++; tot++;
    }
    return bins.map((b) => ({ x: b.x, twin: +(b.twin / (tot || 1)).toFixed(4) }));
  }, [hoods]);

  const census = ev?.census;
  const scatterKeys = census ? Object.keys(census.scatter) : [];
  const key = sk ?? scatterKeys[0];
  const scatterRow = census?.rows.find((r) => `${r.city}|${r.label}` === key);
  const pts = useMemo(() => (census && key ? census.scatter[key] : []), [census, key]);
  const pairs = useMemo(() => ev?.pairs.filter((p) => split === "all" || p.split === split) ?? [], [ev, split]);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-24 sm:px-8 sm:pt-28">
      <div className="mb-10">
        <p className="label text-primary">evaluation</p>
        <h1 className="mt-3 text-balance text-[clamp(32px,5vw,56px)] font-medium leading-[1.04] tracking-[-0.05em]">
          What the data <span className="text-primary">supports.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
          Three questions, each with labels committed before any result was computed: does raw Qloo data separate neighbourhoods, does the
          corrected map agree with the census, and does Twin find the twins people already name. Losses are shown next to wins.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-dim">
          <span>ground truth <span className="text-muted-foreground">edf9056</span></span>
          {census && <span>census hypotheses <span className="text-muted-foreground">{census.preregisteredCommit.slice(0, 7)}</span></span>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {ev ? (
          <>
            <Kpi label="cross-city cosine, corrected" value={ev.rawCollapse.twin_mean_cos ?? null} accent
              note={<>raw scores average <span className="text-foreground">{f2(ev.rawCollapse.raw_mean_cos)}</span> — every pair looks the same</>} />
            <Kpi label="census tests where corrected beats raw" value={census ? census.summary.correctedBeatsRaw : null} decimals={0} suffix={census ? ` / ${census.summary.n}` : ""} accent
              note={<>pre-registered, LA + NYC · worse on affluence</>} />
            <Kpi label="hit@3 on published twins, data only" value={ev.methods.twin.hit3}
              note={<>LLM with no data <span className="text-foreground">{f2(ev.methods.llm.hit3)}</span> · random {f2(ev.methods.random.hit3)}</>} />
          </>
        ) : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-none bg-card" />)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="The raw collapse" sub={<>Cosine between neighbourhoods in different cities. Raw scores sit near <span className="num text-foreground">{f2(ev?.rawCollapse.raw_mean_cos)}</span> for almost every pair; corrected scores spread out around <span className="num text-primary">{f2(ev?.rawCollapse.twin_mean_cos)}</span>.</>}>
          {hist.length ? (
            <ChartContainer config={{ twin: { label: "corrected", color: INK.accent } }} className="aspect-auto h-60 w-full">
              <AreaChart data={hist}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="x" tickLine={false} axisLine={false} type="number" domain={[-0.5, 1]} ticks={[-0.5, 0, 0.5, 1]} tick={tick} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="twin" type="monotone" stroke={INK.accent} fill={INK.accent} fillOpacity={0.25} strokeWidth={1.5} />
              </AreaChart>
            </ChartContainer>
          ) : <Skeleton className="h-60 rounded-none bg-card" />}
          <div className="mt-3 flex gap-6 text-[11.5px]">
            <span className="text-muted-foreground">raw spread {f2(ev?.rawCollapse.raw_mean_cos_spread)}</span>
            <span className="text-primary">corrected spread {f2(ev?.rawCollapse.twin_mean_cos_spread)}</span>
          </div>
        </Panel>

        <Panel title="Methods on published twins" sub="Held-out test pairs, both directions. Claude has read the same articles the labels come from, so it wins here.">
          {ev ? (
            <ChartContainer config={config} className="aspect-auto h-60 w-full">
              <BarChart data={bars} barGap={2}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="metric" tickLine={false} axisLine={false} tick={tick} />
                <YAxis domain={[0, 1]} tickLine={false} axisLine={false} width={30} tick={tick} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {METHODS.map((m) => <Bar key={m} dataKey={m} fill={COLORS[m]} radius={0} />)}
              </BarChart>
            </ChartContainer>
          ) : <Skeleton className="h-60 rounded-none bg-card" />}
        </Panel>
      </div>

      {census && (
        <Panel className="mt-4" title="Census check"
          sub={<>{census.summary.n} pre-registered hypotheses (ACS {census.acsYear}, tracts joined to 1 km cells). Spearman ρ between a census variable and the cells&apos; taste score.
            Correct sign: corrected <span className="text-foreground">{census.summary.correctSignCorrected}</span>, raw <span className="text-foreground">{census.summary.correctSignRaw}</span>.
            Mean |ρ|: corrected <span className="text-primary">{f2(census.summary.meanAbsRhoCorrected)}</span>, raw {f2(census.summary.meanAbsRhoRaw)}.</>}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {scatterKeys.map((k) => (
                  <button key={k} onClick={() => setSk(k)}
                    className={cn("border px-2 py-1 text-[11px] transition-colors", k === key ? "border-primary text-primary" : "border-line text-muted-foreground hover:text-foreground")}>
                    {k.split("|")[1]}
                  </button>
                ))}
              </div>
              <ChartContainer config={{ c: { label: "corrected", color: INK.accent }, r: { label: "raw", color: INK.dim } }} className="aspect-auto h-64 w-full">
                <ScatterChart margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={INK.grid} />
                  <XAxis type="number" dataKey="x" tickLine={false} axisLine={false} tick={tick} />
                  <YAxis type="number" dataKey="y" tickLine={false} axisLine={false} width={30} tick={tick} />
                  <ZAxis range={[12, 12]} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Scatter name="r" data={pts.map(([x, , y]) => ({ x, y }))} fill={INK.dim} fillOpacity={0.6} />
                  <Scatter name="c" data={pts.map(([x, y]) => ({ x, y }))} fill={INK.accent} fillOpacity={0.75} />
                </ScatterChart>
              </ChartContainer>
              {scatterRow && (
                <p className="mt-2 text-[11px] text-dim">x = {scatterRow.variable.replace(/_/g, " ")} · corrected ρ <span className="text-primary">{f2(scatterRow.rhoCorrected)}</span> · raw ρ {f2(scatterRow.rhoRaw)} · {scatterRow.n} cells</p>
              )}
            </div>
            <div className="max-h-[22rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow className="hover:bg-transparent"><TableHead>Hypothesis</TableHead><TableHead>City</TableHead><TableHead className="text-right">Raw</TableHead><TableHead className="text-right">Corr.</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {census.rows.map((r) => {
                    const ok = (x: number) => (r.expected === "+" ? x > 0 : x < 0);
                    const win = ok(r.rhoCorrected) && Math.abs(r.rhoCorrected) > Math.abs(r.rhoRaw);
                    return (
                      <TableRow key={r.city + r.label}>
                        <TableCell className="max-w-[16rem] truncate text-muted-foreground" title={r.label}>{r.label}</TableCell>
                        <TableCell className="text-dim">{CITY_CODES[r.city]}</TableCell>
                        <TableCell className={cn("num text-right", ok(r.rhoRaw) ? "text-muted-foreground" : "text-destructive")}>{r.rhoRaw.toFixed(2)}</TableCell>
                        <TableCell className={cn("num text-right", !ok(r.rhoCorrected) ? "text-destructive" : win ? "text-primary" : "text-foreground")}>{r.rhoCorrected.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-dim"><span className="text-primary">amber</span> = corrected beats raw · <span className="text-destructive">red</span> = wrong sign. Correction helps community signals (Latin artists, soul food, Caribbean) and hurts on affluence. 95% CIs are in evals.json and ignore spatial autocorrelation.</p>
        </Panel>
      )}

      <Panel title="Per-pair results" sub="Rank of the published twin among every neighbourhood of the target city (1 = best). Hover a source for the quote." className="mt-4">
        <div className="mb-4 flex gap-1.5">
          {(["test", "dev", "all"] as const).map((s) => (
            <button key={s} onClick={() => setSplit(s)}
              className={cn("border px-2.5 py-1 text-[11.5px] transition-colors", s === split ? "border-primary text-primary" : "border-line text-muted-foreground hover:text-foreground")}>
              {s}{ev && s !== "all" ? ` (${ev.split[s]})` : ""}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Source → published twin</TableHead>
                {METHODS.map((m) => <TableHead key={m} className="text-center"><span style={{ color: COLORS[m] }}>{NAMES[m]}</span></TableHead>)}
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((p) => (
                <TableRow key={p.a + p.b}>
                  <TableCell className="whitespace-nowrap">
                    {name.get(p.a) ?? p.a} <span className="text-dim">→</span> {name.get(p.b) ?? p.b}
                    <span className="ml-2 text-[11px] text-dim">{CITY_CODES[cityOf.get(p.b) ?? ""]}</span>
                  </TableCell>
                  {METHODS.map((m) => <TableCell key={m} className="text-center"><RankChip rank={p.rank[m]} /></TableCell>)}
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild><a href={p.source} target="_blank" rel="noreferrer" className="link text-[11.5px] text-muted-foreground">link ↗</a></TooltipTrigger>
                      <TooltipContent className="max-w-xs rounded-none border border-line-strong bg-popover font-mono text-[11px] text-foreground">{p.quote}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {([["basketSweep", "size", "Basket size sweep", "MRR as the number of taste dimensions grows — more dimensions keep helping."],
          ["radiusSweep", "km", "Radius sweep", "MRR as the neighbourhood averaging radius changes — it barely matters."]] as const).map(([k, x, t, s]) => (
          <Panel key={k} title={t} sub={s}>
            {ev ? (
              <ChartContainer config={{ mrr: { label: "MRR", color: INK.accent } }} className="aspect-auto h-52 w-full">
                <LineChart data={ev[k] as Record<string, number>[]}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey={x} tickLine={false} axisLine={false} tick={tick} />
                  <YAxis domain={[0, 0.6]} tickLine={false} axisLine={false} width={30} tick={tick} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="mrr" type="monotone" stroke={INK.accent} strokeWidth={2} dot={{ r: 3, fill: INK.accent, strokeWidth: 0 }} />
                </LineChart>
              </ChartContainer>
            ) : <Skeleton className="h-52 rounded-none bg-card" />}
          </Panel>
        ))}
      </div>

      <Panel title="Sanity checks" sub="Single facts we already know: percentile of one item in one neighbourhood within its city, raw vs corrected." className="mt-4">
        {ev ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Neighbourhood</TableHead><TableHead>Item</TableHead>
                  <TableHead className="text-right">Raw</TableHead><TableHead className="text-right">Corrected</TableHead><TableHead className="w-44">Shift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ev.sanity.map((s) => (
                  <TableRow key={s.city + s.hood + s.item}>
                    <TableCell>{s.hood} <span className="text-[11px] text-dim">{CITY_CODES[s.city] ?? s.city}</span></TableCell>
                    <TableCell className="text-muted-foreground">{s.item}</TableCell>
                    <TableCell className="num text-right text-muted-foreground">{(s.raw_pct * 100).toFixed(0)}</TableCell>
                    <TableCell className="num text-right text-primary">{(s.pct * 100).toFixed(0)}</TableCell>
                    <TableCell>
                      <div className="relative h-px bg-line-strong">
                        <span className="absolute top-1/2 size-2 -translate-y-1/2 bg-muted-foreground" style={{ left: `calc(${s.raw_pct * 100}% - 4px)` }} />
                        <span className="absolute top-1/2 size-2 -translate-y-1/2 bg-primary" style={{ left: `calc(${s.pct * 100}% - 4px)` }} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <Skeleton className="h-40 rounded-none bg-card" />}
      </Panel>

      <Panel title="Methodology" className="mt-4">
        <div className="grid gap-6 text-[12.5px] leading-relaxed text-muted-foreground md:grid-cols-3">
          <div><h3 className="mb-1.5 text-foreground"><span className="text-primary">01</span> labels first</h3><p>Every pair cites a published comparison with a quote, and the census hypotheses list their expected sign. Both files were committed before any model or correlation ran.</p></div>
          <div><h3 className="mb-1.5 text-foreground"><span className="text-primary">02</span> dev / test</h3><p>Only dev pairs were used for tuning. Headline numbers use test pairs. With 21 test pairs, small differences between Twin and raw are within noise.</p></div>
          <div><h3 className="mb-1.5 text-foreground"><span className="text-primary">03</span> fair baseline</h3><p>The LLM gets the same candidate list and must rank it with no Qloo data. Random and raw-Qloo rankings are scored the same way.</p></div>
        </div>
      </Panel>
    </main>
  );
}
