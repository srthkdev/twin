"use client";
import { motion } from "framer-motion";
import { groupOf } from "@/lib/groups";
import type { BasketItem, SharedDim } from "@/lib/types";

export function DivergingBars({ dims, basket, aName, bName }: { dims: SharedDim[]; basket: BasketItem[]; aName: string; bName: string }) {
  const max = Math.max(1, ...dims.flatMap((d) => [Math.abs(d.a), Math.abs(d.b)]));
  return (
    <div role="list" aria-label={`${aName} versus ${bName}`}>
      <div className="mb-2 flex justify-between text-[10px] font-medium uppercase tracking-widest">
        <span className="max-w-[45%] truncate text-violet-300">{aName}</span>
        <span className="max-w-[45%] truncate text-cyan-300">{bName}</span>
      </div>
      <div className="space-y-2.5">
        {dims.map((d, idx) => {
          const item = basket[d.i];
          const g = groupOf(item?.group ?? "lifestyle");
          const wa = (Math.abs(d.a) / max) * 100, wb = (Math.abs(d.b) / max) * 100;
          return (
            <div key={d.i} role="listitem">
              <div className="mb-1 flex items-center justify-center gap-1.5 text-xs text-white/80">
                <g.icon className="size-3" style={{ color: g.color }} aria-hidden />
                {item?.label ?? `#${d.i}`}
              </div>
              <div className="grid grid-cols-2 items-center gap-0.5">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-mono text-[10px] tabular-nums text-white/50">{d.a.toFixed(1)}</span>
                  <div className="flex h-2 w-full justify-end overflow-hidden rounded-l-full bg-white/[0.05]">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${wa}%` }} transition={{ duration: 0.7, delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-l-full" style={{ background: d.a >= 0 ? "linear-gradient(270deg,#8b5cf6,#6d4fd6)" : "repeating-linear-gradient(135deg,#6d4fd666 0 3px,transparent 3px 6px)" }} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex h-2 w-full overflow-hidden rounded-r-full bg-white/[0.05]">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${wb}%` }} transition={{ duration: 0.7, delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-r-full" style={{ background: d.b >= 0 ? "linear-gradient(90deg,#22d3ee,#0ea5b7)" : "repeating-linear-gradient(135deg,#22d3ee66 0 3px,transparent 3px 6px)" }} />
                  </div>
                  <span className="font-mono text-[10px] tabular-nums text-white/50">{d.b.toFixed(1)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
