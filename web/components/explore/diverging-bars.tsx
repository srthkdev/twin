"use client";
import type { BasketItem, SharedDim } from "@/lib/types";
import { Meter } from "./meter";

/** Two places side by side on the same traits: source meter grows left, twin meter grows right. */
export function DivergingBars({ dims, basket, aName, bName }: { dims: SharedDim[]; basket: BasketItem[]; aName: string; bName: string }) {
  const max = Math.max(1, ...dims.flatMap((d) => [Math.abs(d.a), Math.abs(d.b)]));
  const sg = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;
  return (
    <table className="w-full text-[11.5px]" aria-label={`${aName} versus ${bName}`}>
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
            <td className="text-right">
              <span className="num mr-1.5 text-muted-foreground">{sg(d.a)}</span>
              <Meter value={d.a} max={max} width={5} align="right" tone={d.a >= 0 ? "fg" : "dim"} className="text-[9.5px]" />
            </td>
            <td className="pl-2">
              <Meter value={d.b} max={max} width={5} tone={d.b >= 0 ? "accent" : "dim"} className="text-[9.5px]" />
              <span className="num ml-1.5 text-muted-foreground">{sg(d.b)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
