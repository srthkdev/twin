"use client";
import type { BasketItem, SharedDim } from "@/lib/types";
import { Meter, tasteLabel } from "./meter";

/** Two places side by side on the same traits: source meter grows left, twin meter grows right. */
export function DivergingBars({ dims, basket, aName, bName }: { dims: SharedDim[]; basket: BasketItem[]; aName: string; bName: string }) {
  const max = Math.max(1, ...dims.flatMap((d) => [Math.abs(d.a), Math.abs(d.b)]));
  return (
    <table className="w-full text-[11.5px]" aria-label={`${aName} versus ${bName}`}>
      <caption className="caption-bottom pt-2 text-left text-[10.5px] leading-relaxed text-dim">Bright bars: above local average. Dim bars: below.</caption>
      <thead>
        <tr className="h-6 text-[10.5px] text-dim">
          <th className="text-left font-normal">trait</th>
          <th className="w-[92px] truncate text-right font-normal" title={aName}>{aName.toLowerCase().slice(0, 12)}</th>
          <th className="w-[92px] truncate pl-2 text-left font-normal" title={bName}>{bName.toLowerCase().slice(0, 12)}</th>
        </tr>
      </thead>
      <tbody>
        {dims.map((d) => (
          <tr key={d.i} className="h-6">
            <td className="max-w-0 truncate pr-2 text-foreground">{basket[d.i]?.label ?? `#${d.i}`}</td>
            <td className="text-right" title={`${aName}: ${tasteLabel(d.a)}`}>
              <span className="sr-only">{tasteLabel(d.a)}</span>
              <Meter value={d.a} max={max} width={5} align="right" tone={d.a >= 0 ? "fg" : "dim"} className="text-[9.5px]" />
            </td>
            <td className="pl-2" title={`${bName}: ${tasteLabel(d.b)}`}>
              <Meter value={d.b} max={max} width={5} tone={d.b >= 0 ? "accent" : "dim"} className="text-[9.5px]" />
              <span className="sr-only">{tasteLabel(d.b)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
