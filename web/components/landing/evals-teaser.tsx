"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { loadEvals } from "@/lib/data";
import type { Evals, MethodKey } from "@/lib/types";
import { AnimatedNumber } from "@/components/animated-number";
import { Skeleton } from "@/components/ui/skeleton";

const ORDER: { k: MethodKey; label: string; color: string }[] = [
  { k: "twin", label: "Twin", color: "#8b5cf6" },
  { k: "llm", label: "LLM only", color: "#22d3ee" },
  { k: "raw", label: "Raw Qloo", color: "#f59e0b" },
];

export function EvalsTeaser() {
  const [ev, setEv] = useState<Evals | null>(null);
  useEffect(() => { loadEvals().then(setEv).catch(() => {}); }, []);
  return (
    <div className="glass rounded-3xl p-6 sm:p-8">
      <div className="grid gap-6 sm:grid-cols-3">
        {ORDER.map((o) => (
          <div key={o.k}>
            <div className="mb-3 flex items-center gap-2 text-sm text-white/60"><span className="size-2 rounded-full" style={{ background: o.color }} />{o.label}</div>
            {ev ? (
              <>
                <div className="font-mono text-5xl font-medium tabular-nums"><AnimatedNumber value={ev.methods[o.k].hit3} /></div>
                <div className="mt-1 text-xs uppercase tracking-widest text-white/40">hit@3 · MRR <span className="font-mono">{ev.methods[o.k].mrr.toFixed(2)}</span></div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-1000" style={{ width: `${ev.methods[o.k].hit3 * 100}%`, background: o.color }} /></div>
              </>
            ) : <Skeleton className="h-16 w-full bg-white/10" />}
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
        <p className="max-w-xl text-sm text-white/60">Held-out test pairs, ground truth sourced from published neighbourhood comparisons and committed before any model ran.</p>
        <Link href="/evals" className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:border-cyan-300/60 hover:bg-white/5">
          See the full evals <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
