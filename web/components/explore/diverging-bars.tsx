"use client";
import type { BasketItem, SharedDim } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Meter, tasteLabel } from "./meter";

function reading(a: number, b: number, aName: string, bName: string) {
  if (a > 0 && b > 0) return "both love it";
  if (a < 0 && b < 0) return "both avoid it";
  if (a > 0) return `only ${aName}`;
  if (b > 0) return `only ${bName}`;
  if (a < 0) return `${aName} avoids it`;
  if (b < 0) return `${bName} avoids it`;
  return "both at city average";
}

export function DivergingBars({ dims, basket, aName, bName, max = Math.max(1, ...dims.flatMap((d) => [Math.abs(d.a), Math.abs(d.b)])) }: {
  dims: SharedDim[]; basket: BasketItem[]; aName: string; bName: string; max?: number;
}) {
  return (
    <div aria-label={`${aName} versus ${bName}`} role="group" className="mt-3">
      <div className="grid grid-cols-2 gap-4 border-b border-line pb-2">
        {[aName, bName].map((name, i) => (
          <div key={i} className="min-w-0">
            <div className={cn("flex items-center gap-1.5 text-[11.5px]", i === 0 ? "text-foreground" : "text-primary")}>
              <span aria-hidden="true" className={cn("size-2 shrink-0", i === 0 ? "bg-foreground" : "bg-primary")} />
              <span className="truncate" title={name}>{name}</span>
            </div>
            <div className="mt-1.5 flex justify-between gap-1 text-[10px] text-muted-foreground">
              <span>← less</span><span>city avg</span><span>more →</span>
            </div>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {dims.map((d) => {
          const label = basket[d.i]?.label ?? "Taste unavailable";
          return (
            <li key={d.i} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3 leading-snug">
                <span className="min-w-0 truncate text-[12.5px] text-foreground" title={label}>{label}</span>
                <span className={cn("max-w-[55%] shrink-0 break-words text-right text-[10.5px]", d.a > 0 && d.b <= 0 ? "text-foreground" : d.b > 0 && d.a <= 0 ? "text-primary" : "text-muted-foreground")}>
                  {reading(d.a, d.b, aName, bName)}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 items-center gap-4">
                <div title={`${aName}: ${tasteLabel(d.a)}`}>
                  <span className="sr-only">{aName}: {tasteLabel(d.a)}.</span>
                  <Meter value={d.a} max={max} centered tone="fg" />
                </div>
                <div title={`${bName}: ${tasteLabel(d.b)}`}>
                  <span className="sr-only">{bName}: {tasteLabel(d.b)}.</span>
                  <Meter value={d.b} max={max} centered tone="accent" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!dims.length && <p className="pt-3 text-[11.5px] text-muted-foreground">No tastes to compare here yet.</p>}
    </div>
  );
}
