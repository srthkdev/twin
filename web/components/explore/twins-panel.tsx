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
  const traitMax = Math.max(1, ...(sel ? [...sel.shared, ...sel.diverge].flatMap((d) => [Math.abs(d.a), Math.abs(d.b)]) : []));

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
          <span className="text-foreground">popularity view.</span> Busy blocks score highly for almost every taste. The matches below still use distinctive local taste, with busyness accounted for.
          {evals?.rawCollapse.raw_mean_cos != null && <span className="mt-1 block text-dim">Popularity alone makes neighbourhoods look {Math.round(evals.rawCollapse.raw_mean_cos * 100)}% alike on average.</span>}
        </div>
      )}

      <table className="w-full table-fixed" aria-label="Top twins">
        <thead>
          <tr className="h-7 border-b border-line text-[10.5px] text-dim">
            <th className="w-9 pl-4 text-left font-normal">#</th>
            <th className="text-left font-normal">neighbourhood</th>
            <th className="w-16 font-normal"><span className="sr-only">Match from 0 to 100%</span></th>
            <th className="w-24 pr-4 text-right font-normal">taste match</th>
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
                  <button className={cn("block w-full truncate text-left", active ? "text-foreground" : "text-muted-foreground")} title={h.name} onClick={() => onSelect(m.hood)}>{h.name}</button>
                </td>
                <td><Meter value={m.score} tone={active ? "accent" : "fg"} /></td>
                <td className={cn("num whitespace-nowrap pr-4 text-right text-[11px]", active ? "text-primary" : "text-muted-foreground")}>{Math.round(m.score * 100)}% match</td>
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
          <p className="border-b border-line px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
            How strongly each place leans into a taste compared with the rest of its own city.
          </p>
          <section className="border-b border-line px-4 py-4">
            <Label className="mb-1">shared</Label>
            <p className="text-[11px] text-muted-foreground">The tastes that make them twins.</p>
            <DivergingBars dims={sel.shared} basket={ds.basket} aName={sourceName} bName={hood(sel.hood).name} max={traitMax} />
          </section>
          <section className="px-4 py-4">
            <Label className="mb-1">different</Label>
            <p className="text-[11px] text-muted-foreground">Where their tastes differ most.</p>
            <DivergingBars dims={sel.diverge} basket={ds.basket} aName={sourceName} bName={hood(sel.hood).name} max={traitMax} />
          </section>
        </div>
      )}
    </div>
  );
}
