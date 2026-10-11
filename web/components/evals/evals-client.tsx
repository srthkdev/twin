"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ExternalLink, FlaskConical, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis, Area, AreaChart, ReferenceLine } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/animated-number";
import { loadEvals, loadHoods } from "@/lib/data";
import { cosine } from "@/lib/similarity";
import { cn } from "@/lib/utils";
import type { Evals, Hood, MethodKey } from "@/lib/types";

const COLORS: Record<MethodKey, string> = { twin: "#8b5cf6", llm: "#22d3ee", raw: "#f59e0b", random: "#64748b" };
const NAMES: Record<MethodKey, string> = { twin: "Twin", llm: "LLM only", raw: "Raw Qloo", random: "Random" };
const METHODS: MethodKey[] = ["twin", "llm", "raw", "random"];
const config: ChartConfig = Object.fromEntries(METHODS.map((m) => [m, { label: NAMES[m], color: COLORS[m] }]));

function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6 }} className={cn("glass rounded-3xl p-5 sm:p-6", className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {sub && <p className="mt-1 text-sm text-white/50">{sub}</p>}
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

function RankChip({ rank, m }: { rank: number; m: MethodKey }) {
  const tone = rank === 1 ? "bg-emerald-400/20 text-emerald-300 border-emerald-400/40" : rank <= 3 ? "bg-violet-400/15 text-violet-200 border-violet-400/30" : "bg-white/5 text-white/50 border-white/10";
  return <span className={cn("inline-flex min-w-9 justify-center rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums", tone)} title={`${NAMES[m]} rank`}>#{rank}</span>;
}

export function EvalsClient() {
  const [ev, setEv] = useState<Evals | null>(null);
  const [hoods, setHoods] = useState<Hood[]>([]);
  const [split, setSplit] = useState("test");
  useEffect(() => { loadEvals().then(setEv).catch(() => {}); loadHoods().then(setHoods).catch(() => {}); }, []);
  const name = useMemo(() => new Map(hoods.map((h) => [h.id, h.name])), [hoods]);
  const cityOf = useMemo(() => new Map(hoods.map((h) => [h.id, h.city])), [hoods]);

  const bars = useMemo(() => ev ? [
    { metric: "hit@1", ...Object.fromEntries(METHODS.map((m) => [m, ev.methods[m].hit1])) },
    { metric: "hit@3", ...Object.fromEntries(METHODS.map((m) => [m, ev.methods[m].hit3])) },
    { metric: "MRR", ...Object.fromEntries(METHODS.map((m) => [m, ev.methods[m].mrr])) },
  ] : [], [ev]);

  // histogram of corrected cross-city cosines (real, from hoods) vs raw modelled from its reported spread
  const hist = useMemo(() => {
    if (!ev || hoods.length < 4) return [];
    const vals: number[] = [];
    const step = Math.max(1, Math.floor(hoods.length / 80));
    const sample = hoods.filter((_, i) => i % step === 0);
    for (let i = 0; i < sample.length; i++) for (let j = i + 1; j < sample.length; j++) if (sample[i].city !== sample[j].city) vals.push(cosine(sample[i].v, sample[j].v));
    const bins = Array.from({ length: 30 }, (_, k) => ({ x: -0.5 + k / 30 * 1.5 + 0.025, twin: 0, raw: 0 }));
    for (const v of vals) { const k = Math.min(29, Math.max(0, Math.floor(((v + 0.5) / 1.5) * 30))); bins[k].twin++; }
    const sd = Math.max(0.002, ev.rawCollapse.raw_mean_cos_spread / 2.56);
    const mean = 1 - ev.rawCollapse.raw_mean_cos_spread;
    bins.forEach((b) => { b.raw = Math.exp(-0.5 * ((b.x - mean) / sd) ** 2) > 0.01 ? vals.length * 0.05 * Math.exp(-0.5 * ((b.x - mean) / sd) ** 2) : 0; });
    const tot = vals.length || 1;
    return bins.map((b) => ({ x: +b.x.toFixed(2), twin: +(b.twin / tot).toFixed(3), raw: +(b.raw / tot).toFixed(3) }));
  }, [ev, hoods]);

  const pairs = useMemo(() => ev?.pairs.filter((p) => split === "all" || p.split === split) ?? [], [ev, split]);
  const kpis = ev ? [
    { k: "hit1" as const, label: "hit@1", fmt: (x: number) => x },
    { k: "hit3" as const, label: "hit@3", fmt: (x: number) => x },
    { k: "mrr" as const, label: "MRR", fmt: (x: number) => x },
  ] : [];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:pt-32">
      <div className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300">Evaluation</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Does Twin find <span className="text-gradient">real</span> twins?</h1>
        <p className="mt-4 max-w-2xl text-white/60">Ground truth is neighbourhood pairs that published sources already call twins. Held-out test pairs only; rank is the position of the true twin among every neighbourhood in the target city.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {ev ? kpis.map((kpi, i) => {
          const t = ev.methods.twin[kpi.k];
          const dl = t - ev.methods.llm[kpi.k], dr = t - ev.methods.raw[kpi.k];
          return (
            <motion.div key={kpi.k} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="glass relative overflow-hidden rounded-3xl p-6">
              <div className="absolute -right-10 -top-10 size-40 rounded-full bg-violet-500/20 blur-3xl" />
              <div className="text-sm text-white/50">Twin · {kpi.label} <span className="text-white/30">(n={ev.methods.twin.n})</span></div>
              <div className="mt-2 font-mono text-6xl font-medium tabular-nums"><AnimatedNumber value={t} /></div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-cyan-400/40 font-mono text-cyan-300">{dl >= 0 ? "+" : ""}{dl.toFixed(2)} vs LLM</Badge>
                <Badge variant="outline" className="border-amber-400/40 font-mono text-amber-300">{dr >= 0 ? "+" : ""}{dr.toFixed(2)} vs raw</Badge>
              </div>
            </motion.div>
          );
        }) : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-3xl bg-white/5" />)}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Methods compared" sub="Held-out test pairs. Higher is better.">
          {ev ? (
            <ChartContainer config={config} className="aspect-auto h-72 w-full">
              <BarChart data={bars} barGap={3}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="metric" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 1]} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {METHODS.map((m) => <Bar key={m} dataKey={m} fill={COLORS[m]} radius={[5, 5, 0, 0]} />)}
              </BarChart>
            </ChartContainer>
          ) : <Skeleton className="h-72 bg-white/5" />}
        </Panel>
        <Panel title="The raw collapse" sub="Pairwise cosine between neighbourhoods of different cities. Raw scores pile up near 1.00; corrected scores spread out.">
          {ev ? (
            <>
              <ChartContainer config={{ twin: { label: "Corrected (Twin)", color: COLORS.twin }, raw: { label: "Raw (modelled)", color: COLORS.raw } }} className="aspect-auto h-60 w-full">
                <AreaChart data={hist}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="x" tickLine={false} axisLine={false} type="number" domain={[-0.5, 1]} ticks={[-0.5, 0, 0.5, 1]} />
                  <YAxis hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area dataKey="raw" type="monotone" stroke={COLORS.raw} fill={COLORS.raw} fillOpacity={0.35} />
                  <Area dataKey="twin" type="monotone" stroke={COLORS.twin} fill={COLORS.twin} fillOpacity={0.35} />
                  <ReferenceLine x={1} stroke="#fff" strokeOpacity={0.2} strokeDasharray="3 3" />
                </AreaChart>
              </ChartContainer>
              <div className="mt-3 flex gap-6 font-mono text-xs">
                <span className="text-amber-300">raw spread {ev.rawCollapse.raw_mean_cos_spread.toFixed(2)}</span>
                <span className="text-violet-300">twin spread {ev.rawCollapse.twin_mean_cos_spread.toFixed(2)}</span>
              </div>
              <p className="mt-2 text-[11px] text-white/35">Corrected histogram computed live from hood vectors; raw curve is modelled from the reported spread.</p>
            </>
          ) : <Skeleton className="h-72 bg-white/5" />}
        </Panel>
      </div>

      <Panel title="Per-pair results" sub="Rank of the ground-truth twin among all neighbourhoods in the target city (1 = best). Hover a source for the quote." className="mt-6">
        <Tabs value={split} onValueChange={setSplit} className="mb-4">
          <TabsList className="bg-white/5">
            <TabsTrigger value="test">Test{ev ? ` (${ev.split.test})` : ""}</TabsTrigger>
            <TabsTrigger value="dev">Dev{ev ? ` (${ev.split.dev})` : ""}</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>Source → expected twin</TableHead>
                {METHODS.map((m) => <TableHead key={m} className="text-center"><span style={{ color: COLORS[m] }}>{NAMES[m]}</span></TableHead>)}
                <TableHead>Source</TableHead>
                <TableHead>Split</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((p) => (
                <TableRow key={p.a + p.b} className="border-white/5 hover:bg-white/[0.04]">
                  <TableCell className="whitespace-nowrap font-medium">
                    {name.get(p.a) ?? p.a} <span className="text-white/30">→</span> {name.get(p.b) ?? p.b}
                    <span className="ml-2 text-xs text-white/35">{cityOf.get(p.b)}</span>
                  </TableCell>
                  {METHODS.map((m) => <TableCell key={m} className="text-center"><RankChip rank={p.rank[m]} m={m} /></TableCell>)}
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a href={p.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-300 underline-offset-4 hover:underline">link <ExternalLink className="size-3" /></a>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{p.quote}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell><Badge variant="outline" className={cn("text-[10px] uppercase", p.split === "test" ? "border-violet-400/40 text-violet-300" : "text-white/50")}>{p.split}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Basket size sweep" sub="MRR as the number of taste dimensions grows.">
          {ev ? (
            <ChartContainer config={{ mrr: { label: "MRR", color: COLORS.twin } }} className="aspect-auto h-60 w-full">
              <LineChart data={ev.basketSweep}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="size" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 1]} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="mrr" type="monotone" stroke={COLORS.twin} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.twin }} />
              </LineChart>
            </ChartContainer>
          ) : <Skeleton className="h-60 bg-white/5" />}
        </Panel>
        <Panel title="Radius sweep" sub="MRR as the neighbourhood averaging radius (km) changes.">
          {ev ? (
            <ChartContainer config={{ mrr: { label: "MRR", color: COLORS.llm } }} className="aspect-auto h-60 w-full">
              <LineChart data={ev.radiusSweep}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="km" tickLine={false} axisLine={false} unit=" km" />
                <YAxis domain={[0, 1]} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="mrr" type="monotone" stroke={COLORS.llm} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.llm }} />
              </LineChart>
            </ChartContainer>
          ) : <Skeleton className="h-60 bg-white/5" />}
        </Panel>
      </div>

      <Panel title="Sanity checks" sub="Items we know the answer to. Correction pushes true local signals up and popularity-driven ones down." className="mt-6">
        {ev ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead>Neighbourhood</TableHead><TableHead>Item</TableHead>
                  <TableHead className="text-right">Corrected pct</TableHead><TableHead className="text-right">Raw pct</TableHead><TableHead className="w-40">Shift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ev.sanity.map((s) => (
                  <TableRow key={s.city + s.hood + s.item} className="border-white/5 hover:bg-white/[0.04]">
                    <TableCell className="font-medium">{s.hood} <span className="text-xs text-white/35">{s.city}</span></TableCell>
                    <TableCell>{s.item}</TableCell>
                    <TableCell className="text-right font-mono text-violet-300">{(s.pct * 100).toFixed(0)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-300">{(s.raw_pct * 100).toFixed(0)}</TableCell>
                    <TableCell>
                      <div className="relative h-1.5 rounded-full bg-white/10">
                        <span className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-amber-400" style={{ left: `calc(${s.raw_pct * 100}% - 5px)` }} />
                        <span className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-violet-400" style={{ left: `calc(${s.pct * 100}% - 5px)` }} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <Skeleton className="h-40 bg-white/5" />}
      </Panel>

      <Panel title="Methodology" className="mt-6">
        <div className="grid gap-6 text-sm leading-relaxed text-white/65 md:grid-cols-3">
          <div><ShieldCheck className="mb-2 size-5 text-emerald-300" /><h3 className="mb-1 font-semibold text-white">Ground truth first</h3><p>Every pair cites a published source comparing two neighbourhoods, with a quote. The file was written and committed before any model ran, so results cannot tune the labels.</p></div>
          <div><FlaskConical className="mb-2 size-5 text-violet-300" /><h3 className="mb-1 font-semibold text-white">Dev / test split</h3><p>Dev pairs were used for tuning (radius, basket size). Test pairs were never looked at until the final run, and all headline numbers use test only.</p></div>
          <div><ArrowUpRight className="mb-2 size-5 text-cyan-300" /><h3 className="mb-1 font-semibold text-white">Fair LLM baseline</h3><p>The LLM-only baseline receives the same candidate list of target-city neighbourhoods and must rank them with no Qloo data. Random and raw-Qloo rankings are scored identically.</p></div>
        </div>
      </Panel>
    </main>
  );
}
