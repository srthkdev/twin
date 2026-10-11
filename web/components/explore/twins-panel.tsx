"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftRight, AlertTriangle } from "lucide-react";
import { ScoreRing } from "@/components/score-ring";
import { DivergingBars } from "./diverging-bars";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DataSet, TwinMatch } from "@/lib/types";
import type { Mode } from "@/components/map/explore-map";
import type { Evals } from "@/lib/types";

export function TwinsPanel({ ds, matches, selected, onSelect, sourceName, targetName, mode, onSwap, evals, loading }: {
  ds: DataSet; matches: TwinMatch[]; selected: string | null; onSelect: (id: string) => void; sourceName: string; targetName: string;
  mode: Mode; onSwap: () => void; evals: Evals | null; loading: boolean;
}) {
  const sel = matches.find((m) => m.hood === selected) ?? matches[0];
  const hood = (id: string) => ds.hoods.find((h) => h.id === id)!;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-white/40">Cultural twins in</div>
          <div className="text-xl font-semibold">{targetName}</div>
        </div>
        <Button variant="outline" size="sm" onClick={onSwap} className="gap-1.5 border-white/15 bg-white/5" aria-label="Swap direction"><ArrowLeftRight className="size-3.5" /> Swap</Button>
      </div>

      {mode === "raw" && (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3.5 text-sm text-amber-100">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-4" /> Raw view</div>
          Raw cosine spread across hoods: <span className="font-mono">{evals?.rawCollapse.raw_mean_cos_spread.toFixed(2) ?? "0.01"}</span> vs{" "}
          <span className="font-mono">{evals?.rawCollapse.twin_mean_cos_spread.toFixed(2) ?? "0.60"}</span> after correction. Switch to Twin to see rankings that mean something.
        </div>
      )}

      <ul className="space-y-2" aria-label="Top twins">
        {loading && Array.from({ length: 5 }).map((_, i) => <li key={i} className="h-[68px] animate-pulse rounded-2xl bg-white/[0.05]" />)}
        {matches.map((m, i) => {
          const h = hood(m.hood);
          const active = sel?.hood === m.hood;
          return (
            <motion.li key={m.hood} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
              <button onClick={() => onSelect(m.hood)} aria-pressed={active}
                className={cn("group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                  active ? "border-violet-400/60 bg-violet-500/10 glow-ring" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]")}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold", i === 0 ? "bg-gradient-accent text-black" : "bg-white/10 text-white/70")}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.name}</span>
                  <span className="block truncate text-xs text-white/50">{h.blurb ?? `Shares ${m.shared.slice(0, 2).map((s) => ds.basket[s.i]?.label).join(" & ")}`}</span>
                </span>
                <ScoreRing score={m.score} />
              </button>
            </motion.li>
          );
        })}
      </ul>

      <AnimatePresence mode="wait">
        {sel && (
          <motion.div key={sel.hood} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-5">
            <section>
              <h3 className="mb-3 text-sm font-semibold">Why they match</h3>
              <DivergingBars dims={sel.shared} basket={ds.basket} aName={sourceName} bName={hood(sel.hood).name} />
            </section>
            <section>
              <h3 className="mb-3 text-sm font-semibold text-white/80">Where they differ</h3>
              <DivergingBars dims={sel.diverge} basket={ds.basket} aName={sourceName} bName={hood(sel.hood).name} />
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
