"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const COLS = 24, ROWS = 14;
const CENTERS = [
  { x: 5, y: 4, h: 268, name: "indie" }, { x: 18, y: 4, h: 190, name: "latin" },
  { x: 8, y: 10, h: 330, name: "luxury" }, { x: 19, y: 10, h: 38, name: "nightlife" },
  { x: 12, y: 7, h: 150, name: "food" },
];

function cellData() {
  const out: { raw: number; hue: number; tw: number }[] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const dx = (x - COLS / 2) / (COLS / 2.4), dy = (y - ROWS / 2) / (ROWS / 2.2);
    const raw = Math.exp(-(dx * dx + dy * dy) * 1.6);
    let best = 0, bh = 0;
    for (const c of CENTERS) {
      const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
      const w = Math.exp(-d2 / 14);
      if (w > best) { best = w; bh = c.h; }
    }
    out.push({ raw, hue: bh, tw: Math.min(1, best * 1.15) });
  }
  return out;
}

export function BugVisual() {
  const cells = useMemo(cellData, []);
  const [twin, setTwin] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!inView || !auto || reduce) return;
    const t = setInterval(() => setTwin((v) => !v), 3400);
    return () => clearInterval(t);
  }, [inView, auto, reduce]);

  return (
    <div ref={ref} className="glass relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div role="tablist" aria-label="View" className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1 text-sm">
          {[["Raw Qloo", false], ["Twin", true]].map(([l, v]) => (
            <button key={String(l)} role="tab" aria-selected={twin === v} onClick={() => { setAuto(false); setTwin(v as boolean); }}
              className={cn("relative rounded-lg px-4 py-1.5 font-medium transition", twin === v ? "text-black" : "text-white/60 hover:text-white")}>
              {twin === v && <motion.span layoutId="bug-pill" className={cn("absolute inset-0 -z-10 rounded-lg", v ? "bg-gradient-accent" : "bg-amber-300")} />}
              {l as string}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-white/50">{twin ? "cosine spread 0.60" : "cosine spread 0.01"}</span>
      </div>
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }} aria-hidden>
        {cells.map((c, i) => (
          <div
            key={i}
            className="aspect-square rounded-[3px] transition-[background-color,transform,opacity] duration-1000 ease-out"
            style={{
              transitionDelay: `${((i % COLS) + Math.floor(i / COLS)) * 14}ms`,
              backgroundColor: twin ? `hsl(${c.hue} 85% ${28 + c.tw * 38}%)` : `hsl(${38 - c.raw * 14} 95% ${14 + c.raw * 52}%)`,
              opacity: twin ? 0.35 + c.tw * 0.65 : 0.4 + c.raw * 0.6,
              transform: twin ? `scale(${0.7 + c.tw * 0.3})` : "scale(1)",
            }}
          />
        ))}
      </div>
      <p className="mt-5 min-h-12 text-sm text-white/70" aria-live="polite">
        {twin
          ? "After correction, each block keeps only what is distinctive about it: indie strips, Latin corridors, old money, night economies."
          : "Raw affinity tracks popularity (r = 0.97). Every neighbourhood lights up where people are — so every pair of hoods looks ~1.00 similar."}
      </p>
    </div>
  );
}
