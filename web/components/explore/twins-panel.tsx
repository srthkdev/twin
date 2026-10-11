"use client";
import { DivergingBars } from "./diverging-bars";
import { Label, Meter } from "./meter";
import { cn } from "@/lib/utils";
import type { DataSet, Evals, TwinMatch } from "@/lib/types";
import type { Mode } from "@/components/map/explore-map";

export function TwinsPanel({ ds, matches, selected, onSelect, sourceName, targetName, mode, onSwap, evals }: {
  ds: DataSet; matches: TwinMatch[]; selected: string | null; onSelect: (id: string) => void; sourceName: string; targetName: string;
  mode: Mode; onSwap: () => void; evals: Evals | null; loading?: boolean;
}) {
  const sel = matches.find((m) => m.hood === selected) ?? matches[0];
  const hood = (id: string) => ds.hoods.find((h) => h.id === id)!;
  const max = Math.max(0.01, ...matches.map((m) => m.score));

  return (
    <div className="text-[12.5px]">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4">
        <div className="min-w-0">
          <Label>twins</Label>
          <h2 className="mt-2 truncate text-[15px] tracking-[-0.02em] text-foreground">
            {sourceName.toLowerCase()} <span className="text-dim">→</span> {targetName.toLowerCase()}
          </h2>
        </div>
        <button onClick={onSwap} className="shrink-0 border border-line px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-line-strong hover:text-foreground" aria-label="Swap direction">
          ⇄ swap
        </button>
      </div>

      {mode === "raw" && (
        <div className="border-b border-line bg-raised px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">raw view.</span> Raw scores barely separate neighbourhoods: average spread{" "}
          <span className="num text-foreground">{evals?.rawCollapse.raw_mean_cos_spread.toFixed(2) ?? "–"}</span> vs{" "}
          <span className="num text-primary">{evals?.rawCollapse.twin_mean_cos_spread.toFixed(2) ?? "–"}</span> corrected. The ranking below is the corrected one.
        </div>
      )}

      <table className="w-full" aria-label="Top twins">
        <thead>
          <tr className="h-7 border-b border-line text-[10.5px] text-dim">
            <th className="w-9 pl-4 text-left font-normal">#</th>
            <th className="text-left font-normal">neighbourhood</th>
            <th className="w-[88px] font-normal" />
            <th className="w-14 pr-4 text-right font-normal">cos</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => {
            const h = hood(m.hood);
            const active = sel?.hood === m.hood;
            return (
              <tr key={m.hood} onClick={() => onSelect(m.hood)} aria-selected={active}
                className={cn("h-9 cursor-pointer border-b border-line transition-colors", active ? "bg-raised" : "hover:bg-accent")}>
                <td className={cn("num pl-4", active ? "text-primary" : "text-dim")}>{i + 1}</td>
                <td className="max-w-0 truncate pr-2">
                  <button className={cn("truncate text-left", active ? "text-foreground" : "text-muted-foreground")} onClick={() => onSelect(m.hood)}>{h.name}</button>
                </td>
                <td className="text-[10px]"><Meter value={m.score} max={max} width={8} tone={active ? "accent" : "fg"} /></td>
                <td className={cn("num pr-4 text-right", active ? "text-primary" : "text-muted-foreground")}>{m.score.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sel && (
        <div key={sel.hood}>
          {hood(sel.hood).blurb && (
            <p className="border-b border-line px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
              <span className="text-foreground">{hood(sel.hood).name}.</span> {hood(sel.hood).blurb}
            </p>
          )}
          <section className="border-b border-line px-4 py-4">
            <Label className="mb-1">shared</Label>
            <DivergingBars dims={sel.shared} basket={ds.basket} aName={sourceName} bName={hood(sel.hood).name} />
          </section>
          <section className="px-4 py-4">
            <Label className="mb-1">different</Label>
            <DivergingBars dims={sel.diverge} basket={ds.basket} aName={sourceName} bName={hood(sel.hood).name} />
          </section>
        </div>
      )}
    </div>
  );
}
