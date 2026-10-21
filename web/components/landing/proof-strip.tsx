"use client";
import Link from "next/link";
import { count, percent, useProof } from "./use-proof";

export function ProofStrip() {
  const { backtest: data, failed } = useProof();
  return (
    <div className="max-w-xl border-t border-line pt-4 text-[12px] leading-relaxed" aria-live="polite">
      <p className="label mb-2">tested on real chain locations</p>
      {data ? <>
        <p className="text-muted-foreground">Among equally busy blocks, Twin finds a taste-led chain&apos;s real sites <span className="num text-primary">{percent(data.classes.taste.within[0])}</span> of the time <span className="text-dim">(chance 50%)</span>.</p>
        <p className="mt-2 text-[11px] text-dim"><span className="num">{count(data.classes.taste.brands)}</span> taste-led chains · <span className="num">{count(data.classes.taste.pairs)}</span> city-pair tests. Each comparison ranks a real site against another block with similar busyness.</p>
        <p className="mt-2 text-[11px] text-dim">Full study: <span className="num">{count(data.classes.all.brands)}</span> chains · <span className="num">{count(data.classes.all.pairs)}</span> city-pair tests. Taste alone does not beat footfall.</p>
      </> : <p className="text-dim">{failed ? "The proof data could not be loaded." : "Loading the chain placement study…"}</p>}
      <Link href="/evals" className="link mt-2 inline-block text-[11px] text-muted-foreground">results and limits →</Link>
    </div>
  );
}
