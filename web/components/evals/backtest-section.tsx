"use client";
import { useJson } from "@/hooks/use-json";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Interval = [number, [number, number]];
type ModelStats = { n: number; busy: number; model: number; delta: number; delta_ci: [number, number]; improves: number };
type ClassStats = {
  pairs: number;
  brands: number;
  twin: Interval;
  raw: Interval;
  busy: Interval;
  within: Interval;
  withinAboveChance: number;
  twinBeatsRaw: number;
  model: ModelStats;
};
type BrandRow = [string, "taste" | "convenience" | "other", string, number, number, number];
type Backtest = {
  generatedAt: string;
  source: string;
  sites: number;
  hypotheses: { id: string; text: string; preregistered: boolean; verdict: string }[];
  classes: Record<"all" | "taste" | "convenience" | "other", ClassStats>;
  brands: BrandRow[];
  hist: { taste: number[]; convenience: number[] };
};

const INK = { accent: "var(--primary)", fg: "var(--foreground)", muted: "var(--muted-foreground)", dim: "var(--dim)", grid: "var(--line)" };
const SERIES = [
  { key: "twin", label: "Twin", color: INK.fg },
  { key: "raw", label: "Raw Qloo popularity", color: INK.muted },
  { key: "busy", label: "Busyness", color: INK.dim },
  { key: "within", label: "Twin · equally busy", color: INK.accent },
] as const;
const CLASS_ORDER = ["taste", "convenience", "other", "all"] as const;
const CLASS_LABEL: Record<string, string> = { taste: "Taste-led", convenience: "Convenience", other: "Other", all: "All" };
const fmt = (n: number, digits = 3) => n.toFixed(digits);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Panel({ title, sub, children, className }: { title: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("panel p-5 sm:p-6", className)}>
      <h2 className="text-[15px] font-medium tracking-[-0.02em] text-foreground">{title}</h2>
      {sub && <p className="mt-1.5 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function AucChart({ data }: { data: Backtest }) {
  const left = 178, right = 24, top = 24, axisY = 356, width = 920, height = 386;
  const plotW = width - left - right;
  const x = (value: number) => left + ((value - 0.45) / 0.55) * plotW;
  const ticks = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full" role="img" aria-label="Median AUC and 95 percent bootstrap confidence intervals by class and scorer">
        {ticks.map((tick) => <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={top} y2={axisY} stroke={tick === 0.5 ? INK.dim : INK.grid} strokeDasharray={tick === 0.5 ? "5 5" : undefined} />
          <text x={x(tick)} y={axisY + 22} textAnchor="middle" fill={INK.dim} fontSize="11" fontFamily="var(--font-geist-mono)">{tick.toFixed(1)}</text>
        </g>)}
        <text x={x(0.5) + 7} y={top + 12} fill={INK.dim} fontSize="10" fontFamily="var(--font-geist-mono)">chance</text>
        {CLASS_ORDER.map((name, classIndex) => {
          const stats = data.classes[name];
          const groupY = 56 + classIndex * 78;
          return <g key={name}>
            {classIndex > 0 && <line x1="0" x2={width - right} y1={groupY - 34} y2={groupY - 34} stroke={INK.grid} />}
            <text x="8" y={groupY - 2} fill="var(--foreground)" fontSize="12" fontFamily="var(--font-geist-mono)">{CLASS_LABEL[name]}</text>
            <text x="8" y={groupY + 14} fill={INK.dim} fontSize="10" fontFamily="var(--font-geist-mono)">{stats.pairs.toLocaleString()} pairs</text>
            {SERIES.map((series, seriesIndex) => {
              const [median, [lo, hi]] = stats[series.key];
              const y = groupY - 22 + seriesIndex * 14;
              return <g key={series.key}>
                <title>{`${CLASS_LABEL[name]} · ${series.label}: ${fmt(median)} [${fmt(lo)}, ${fmt(hi)}]`}</title>
                <line x1={x(lo)} x2={x(hi)} y1={y} y2={y} stroke={series.color} strokeWidth="2" />
                <line x1={x(lo)} x2={x(lo)} y1={y - 3.5} y2={y + 3.5} stroke={series.color} />
                <line x1={x(hi)} x2={x(hi)} y1={y - 3.5} y2={y + 3.5} stroke={series.color} />
                <circle cx={x(median)} cy={y} r="3.2" fill={series.color} />
              </g>;
            })}
          </g>;
        })}
        <line x1={left} x2={width - right} y1={axisY} y2={axisY} stroke={INK.grid} />
        <text x={width - right} y={top - 10} textAnchor="end" fill={INK.dim} fontSize="10" fontFamily="var(--font-geist-mono)">median ROC AUC · 95% bootstrap CI</text>
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[10.5px] text-muted-foreground">
        {SERIES.map((s) => <span key={s.key} className="inline-flex items-center gap-2"><i className="inline-block h-[2px] w-5" style={{ backgroundColor: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}

function Histogram({ data }: { data: Backtest }) {
  const taste = data.hist.taste, convenience = data.hist.convenience;
  const width = 840, height = 242, left = 38, right = 18, top = 10, bottom = 32;
  const plotW = width - left - right, plotH = height - top - bottom;
  const max = Math.ceil(Math.max(...taste, ...convenience) / 50) * 50;
  const ticks = [0, max / 2, max];
  const binW = plotW / taste.length;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[560px] w-full" role="img" aria-label="Overlaid histogram of within-busyness AUC for taste-led and convenience brands">
        {ticks.map((tick) => {
          const y = top + plotH - tick / max * plotH;
          return <g key={tick}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke={INK.grid} />
            <text x={left - 8} y={y + 4} textAnchor="end" fill={INK.dim} fontSize="10" fontFamily="var(--font-geist-mono)">{Math.round(tick)}</text>
          </g>;
        })}
        {convenience.map((value, index) => {
          const x = left + index * binW + 1;
          const h = value / max * plotH;
          return <g key={`bin-${index}`}>
            <rect x={x} y={top + plotH - h} width={binW - 2} height={h} fill={INK.muted} fillOpacity="0.55"><title>{`Convenience, ${fmt(index / taste.length, 2)}–${fmt((index + 1) / taste.length, 2)}: ${value} pairs`}</title></rect>
            <rect x={x} y={top + plotH - taste[index] / max * plotH} width={binW - 2} height={taste[index] / max * plotH} fill={INK.accent} fillOpacity="0.68"><title>{`Taste-led, ${fmt(index / taste.length, 2)}–${fmt((index + 1) / taste.length, 2)}: ${taste[index]} pairs`}</title></rect>
          </g>;
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((value) => <text key={value} x={left + value * plotW} y={height - 9} textAnchor="middle" fill={INK.dim} fontSize="10" fontFamily="var(--font-geist-mono)">{value.toFixed(value === 0 || value === 1 ? 0 : 2)}</text>)}
        <text x={left} y={top + 10} fill={INK.dim} fontSize="10" fontFamily="var(--font-geist-mono)">brand-pair count</text>
      </svg>
      <div className="mt-2 flex gap-5 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-2"><i className="size-2 bg-primary" />Taste-led</span>
        <span className="inline-flex items-center gap-2"><i className="size-2 bg-muted-foreground" />Convenience</span>
      </div>
    </div>
  );
}

function BrandStrip({ data }: { data: Backtest }) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const brands = useMemo(() => data.brands
    .filter((row) => row[3] >= 6 && (classFilter === "all" || row[1] === classFilter) && `${row[0]} ${row[2]}`.includes(query.trim().toLowerCase()))
    .sort((a, b) => b[4] - a[4]), [data.brands, classFilter, query]);
  const color = (kind: BrandRow[1]) => kind === "taste" ? "var(--primary)" : kind === "convenience" ? "var(--muted-foreground)" : "var(--foreground)";
  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="min-w-0 flex-1 border border-line px-2.5 py-2 text-[11px] text-dim">
          <span className="mr-2 text-muted-foreground">search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-[75%] bg-transparent text-foreground outline-none placeholder:text-dim" placeholder="brand or category" aria-label="Search brands" />
        </label>
        <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} aria-label="Filter brands by class" className="border border-line bg-background px-2.5 py-2 text-[11px] text-foreground">
          <option value="all">all classes</option><option value="taste">taste-led</option><option value="convenience">convenience</option><option value="other">other</option>
        </select>
        <span className="num text-[10.5px] text-dim">{brands.length} / {data.brands.filter((row) => row[3] >= 6).length} brands</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[minmax(150px,1.2fr)_minmax(180px,2fr)_52px_64px] gap-3 border-b border-line px-2 pb-2 text-[9.5px] uppercase tracking-[0.12em] text-dim">
            <span>brand · class</span><span>within-busyness AUC</span><span className="text-right">AUC</span><span className="text-right">pairs</span>
          </div>
          <div className="max-h-[34rem] overflow-y-auto">
            {brands.map((row) => <div key={row[0]} title={`${row[2].replace(/_/g, " ")} · raw Twin AUC ${fmt(row[5])}`} className="grid h-8 grid-cols-[minmax(150px,1.2fr)_minmax(180px,2fr)_52px_64px] items-center gap-3 border-b border-line/60 px-2 text-[10.5px] hover:bg-card">
              <span className="flex min-w-0 items-center gap-2"><i className="size-1.5 shrink-0" style={{ backgroundColor: color(row[1]) }} /><span className="truncate text-foreground">{row[0]}</span><span className="hidden text-[9px] text-dim xl:inline">{CLASS_LABEL[row[1]]}</span></span>
              <span className="relative h-3">
                {[0.25, 0.5, 0.75].map((tick) => <i key={tick} className="absolute inset-y-0 w-px bg-line" style={{ left: `${tick * 100}%` }} />)}
                <i className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${row[4] * 100}%`, backgroundColor: color(row[1]) }} />
              </span>
              <span className="num text-right text-muted-foreground">{fmt(row[4], 2)}</span><span className="num text-right text-dim">{row[3]}</span>
            </div>)}
            {!brands.length && <p className="px-2 py-8 text-center text-[11px] text-dim">no brands match</p>}
          </div>
          <div className="mt-2 flex justify-between px-2 text-[9.5px] text-dim"><span>0.0</span><span>0.5</span><span>1.0</span></div>
        </div>
      </div>
    </>
  );
}

export function BacktestSection() {
  const { data = null, error } = useJson<Backtest>("/data/backtest.json");
  const failed = !!error;

  return (
    <div className="mt-4 space-y-4">
        <Panel title="Does taste predict where real businesses open?" sub={<>Chain placement backtest · {data ? data.generatedAt : "loading results"} · {data?.source}</>}>
        {data ? <div className="space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
          <p>{data.sites.toLocaleString()} branded places from Overture; {data.classes.all.brands} chains; {data.classes.all.pairs.toLocaleString()} directed (brand, A → B) pairs across six cities.</p>
          <p>The strip below includes {data.brands.filter((row) => row[3] >= 6).length} brands with at least six pairs.</p>
          <p>For each pair, score each city-B block by the cosine between the brand&apos;s city-A fingerprint and the block fingerprint.</p>
          <p>Label a block positive when it contains at least one site of that brand.</p>
        </div> : <p className="text-[11px] text-dim">{failed ? "Could not load /data/backtest.json." : "loading /data/backtest.json…"}</p>}
      </Panel>

      {data && <>
        <Panel title="Pre-registration and verdicts" sub="Confirmatory hypotheses were written before scoring. Exploratory combinations were added after H1–H4; failures stay in the table.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-[11px]">
              <thead><tr className="border-b border-line text-[9.5px] uppercase tracking-[0.12em] text-dim"><th className="w-14 py-2 pr-3">ID</th><th className="py-2 pr-4">Hypothesis</th><th className="w-28 py-2 pr-4">Pre-registered</th><th className="w-24 py-2">Verdict</th></tr></thead>
              <tbody>{data.hypotheses.map((hypothesis) => <tr key={hypothesis.id} className="border-b border-line/60 align-top">
                <td className="num py-2.5 pr-3 text-dim">{hypothesis.id}</td><td className="py-2.5 pr-4 text-muted-foreground">{hypothesis.text}</td>
                <td className="py-2.5 pr-4 text-dim">{hypothesis.preregistered ? "yes" : "no · exploratory"}</td>
                <td className={cn("py-2.5 uppercase tracking-[0.08em]", hypothesis.verdict === "holds" ? "text-primary" : hypothesis.verdict === "fails" ? "text-destructive" : "text-muted-foreground")}>{hypothesis.verdict}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 max-w-4xl text-[11px] leading-relaxed text-muted-foreground"><span className="text-destructive">H2 fails.</span> The corrected fingerprint removes footfall by design; chains follow footfall, so raw popularity ranks their real blocks better overall.</p>
        </Panel>

        <Panel title="Taste adds signal after controlling for busyness" sub="Per-pair median ROC AUC across the full city-B candidate set. Intervals are 95% bootstrap CIs; the dashed line is chance (0.5).">
          <AucChart data={data} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Within-busyness AUC distribution" sub={`${data.hist.taste.length} bins from 0 to 1. Higher values mean the source-city taste profile ranks occupied blocks above unoccupied blocks within busyness strata.`}>
            <Histogram data={data} />
          </Panel>
          <Panel title="Learned model · GroupKFold by brand" sub="Logistic regression with brand-held-out folds; compare the per-trait model against the busyness-only model.">
            <div className="grid grid-cols-3 divide-x divide-line border-y border-line py-4 text-center">
              <div><p className="label">Δ median AUC</p><p className="num mt-2 text-[22px] text-primary">+{fmt(data.classes.all.model.delta, 4)}</p><p className="num mt-1 text-[10px] text-dim">95% CI [{fmt(data.classes.all.model.delta_ci[0], 4)}, {fmt(data.classes.all.model.delta_ci[1], 4)}]</p></div>
              <div><p className="label">pairs improved</p><p className="num mt-2 text-[22px] text-foreground">{pct(data.classes.all.model.improves)}</p><p className="mt-1 text-[10px] text-dim">{data.classes.all.model.n.toLocaleString()} held-out pairs</p></div>
              <div><p className="label">median AUC</p><p className="num mt-2 text-[22px] text-foreground">{fmt(data.classes.all.model.busy, 4)} <span className="text-dim">→</span> {fmt(data.classes.all.model.model, 4)}</p><p className="mt-1 text-[10px] text-dim">busy → model</p></div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">The gain is tiny because busyness already ranks occupied blocks very well, leaving little headroom for taste to improve the full candidate ordering.</p>
          </Panel>
        </div>

        <Panel title="Brand strip · sorted by within-busyness AUC" sub="Each dot is one brand&apos;s median AUC across its city pairs. Hover a row for category and raw Twin AUC; the class filter and search update the full set.">
          <BrandStrip data={data} />
        </Panel>

        <Panel title="What this means">
          <ul className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">
            <li><span className="mr-2 text-primary">01</span>Taste does not replace footfall.</li>
            <li><span className="mr-2 text-primary">02</span>Taste helps decide which busy blocks fit a chain.</li>
            <li><span className="mr-2 text-primary">03</span>The product should rank by busyness first, then by taste match.</li>
          </ul>
          <div className="mt-5 border-t border-line pt-4">
            <p className="label">Limitations</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Overture brand coverage is incomplete; a geohash-6 cell is the unit of analysis; chains do not represent independent businesses; the sample covers six cities.</p>
          </div>
        </Panel>

        <p className="px-1 text-[10.5px] text-dim">Implementation: <a className="link text-muted-foreground" href="https://github.com/srthkdev/twin/tree/main/pipeline/backtest/backtest.py" target="_blank" rel="noreferrer">backtest.py ↗</a><span className="mx-2">·</span><a className="link text-muted-foreground" href="https://github.com/srthkdev/twin/tree/main/pipeline/backtest/model.py" target="_blank" rel="noreferrer">model.py ↗</a></p>
      </>}
    </div>
  );
}
