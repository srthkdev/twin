"use client";
import Link from "next/link";
import { count, percent, useProof } from "./use-proof";

export function EvalsTeaser() {
  const { backtest: data, evals, failed } = useProof();
  const findings = [
    {
      title: "Taste helps distinguish equally busy blocks.",
      note: data ? `Across ${count(data.classes.taste.brands)} taste-led chains and ${count(data.classes.taste.pairs)} city-pair tests, Twin ranks a real site above a comparison block with similar busyness this often. This measures ranking, not the chance a business succeeds.` : "Loading chain placement results…",
      metrics: [{ value: data ? percent(data.classes.taste.within[0]) : "—", label: "taste-led chains · similar busyness" }, { value: "50%", label: "chance" }],
    },
    {
      title: "Taste alone does not beat footfall.",
      note: data ? `Across all ${count(data.classes.all.brands)} chains and ${count(data.classes.all.pairs)} city-pair tests, busyness is stronger at finding real sites. Even combining taste and busyness with equal weight did not beat busyness alone. These are signals for a decision, not forecasts of sales.` : "Loading the comparison with busyness…",
      metrics: [{ value: data ? percent(data.classes.all.twin[0]) : "—", label: "taste alone · real-site ranking" }, { value: data ? percent(data.classes.all.busy[0]) : "—", label: "busyness alone · real-site ranking" }],
    },
    {
      title: "A language model knows more of the famous twins.",
      note: evals ? `On ${count(evals.methods.twin.n)} held-out comparisons from published neighbourhood pairs, the language model puts the known twin in its top three more often. It may already know the articles. Twin adds measured evidence to the agent's reasoning.` : "Loading neighbourhood matching results…",
      metrics: [{ value: evals ? percent(evals.methods.twin.hit3) : "—", label: "Twin · known twin in top three" }, { value: evals ? percent(evals.methods.llm.hit3) : "—", label: "language model alone · top three" }],
    },
  ];

  return (
    <div className="border-t border-line" aria-live="polite">
      {failed && <p className="border-b border-line py-4 text-[12px] text-muted-foreground">Some proof data could not be loaded. The full method and data files are linked below.</p>}
      {findings.map((finding, i) => (
        <div key={finding.title} className="grid gap-4 border-b border-line py-6 md:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
          <span className="num text-dim">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <p className="text-[15px] text-foreground">{finding.title}</p>
            <p className="mt-2 max-w-[56ch] text-[12px] leading-relaxed text-muted-foreground">{finding.note}</p>
          </div>
          {finding.metrics.map((metric, j) => (
            <div key={metric.label}>
              <div className={`num text-[34px] leading-none tracking-tight ${j === 0 ? "text-foreground" : "text-primary"}`}>{metric.value}</div>
              <div className="mt-2 text-[11px] text-dim">{metric.label}</div>
            </div>
          ))}
        </div>
      ))}
      {evals?.census && <p className="border-b border-line py-4 text-[12px] leading-relaxed text-muted-foreground">Against independent census data, accounting for busyness strengthens <span className="num text-foreground">{count(evals.census.summary.correctedBeatsRaw)} of {count(evals.census.summary.n)}</span> pre-registered relationships. It does not improve every relationship, including measures of affluence.</p>}
      {data && <p className="mt-4 text-[11px] leading-relaxed text-dim">Study coverage: <span className="num">{count(data.sites)}</span> branded places in <span className="num">{count(data.cities.length)}</span> cities. Overture coverage is incomplete; chains do not represent all independent businesses. Results: {data.generatedAt}.</p>}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
        <Link href="/evals" className="link text-muted-foreground">all results, confidence ranges and method →</Link>
        <a href="/data/backtest.json" className="link text-dim">chain placement data</a>
        <a href="/data/evals.json" className="link text-dim">matching and census data</a>
      </div>
    </div>
  );
}
