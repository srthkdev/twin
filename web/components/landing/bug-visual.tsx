"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const COLS = 24, ROWS = 14;
// Each community gets its own warm tone (hue, saturation) so clusters read apart without leaving the palette.
const CENTERS = [
  { x: 5, y: 4, h: 34, s: 86, name: "indie" }, { x: 18, y: 4, h: 45, s: 12, name: "latin" },
  { x: 8, y: 10, h: 22, s: 72, name: "luxury" }, { x: 19, y: 10, h: 40, s: 45, name: "nightlife" },
  { x: 12, y: 7, h: 30, s: 30, name: "food" },
];

function cellData() {
  const out: { raw: number; hue: number; sat: number; tw: number }[] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const dx = (x - COLS / 2) / (COLS / 2.4), dy = (y - ROWS / 2) / (ROWS / 2.2);
    const raw = Math.exp(-(dx * dx + dy * dy) * 1.6);
    let best = 0, bh = 0, bs = 0;
    for (const c of CENTERS) {
      const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
      const w = Math.exp(-d2 / 14);
      if (w > best) { best = w; bh = c.h; bs = c.s; }
    }
    out.push({ raw, hue: bh, sat: bs, tw: Math.min(1, best * 1.15) });
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
    <div ref={ref} className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div role="tablist" aria-label="View" className="isolate inline-flex border border-line-strong text-[12px]">
          {[["raw qloo", false], ["corrected", true]].map(([l, v]) => (
            <button key={String(l)} role="tab" aria-selected={twin === v} onClick={() => { setAuto(false); setTwin(v as boolean); }}
              className={cn("relative px-3 py-1 transition-colors", twin === v ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {twin === v && <motion.span layoutId="bug-pill" className={cn("absolute inset-0 -z-10", v ? "bg-primary" : "bg-foreground")} />}
              {l as string}
            </button>
          ))}
        </div>
        <span className="num text-[11px] text-dim">{twin ? "spread 0.73" : "spread 0.11"}</span>
      </div>
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }} aria-hidden>
        {cells.map((c, i) => (
          <div
            key={i}
            className="aspect-square rounded-[1px] transition-[background-color,transform,opacity] duration-1000 ease-out"
            style={{
              transitionDelay: `${((i % COLS) + Math.floor(i / COLS)) * 14}ms`,
              backgroundColor: twin ? `hsl(${c.hue} ${c.sat}% ${(16 + c.tw * 50).toFixed(1)}%)` : `hsl(45 5% ${(10 + c.raw * 58).toFixed(1)}%)`,
              opacity: +(twin ? 0.35 + c.tw * 0.65 : 0.4 + c.raw * 0.6).toFixed(3),
              transform: twin ? `scale(${0.7 + c.tw * 0.3})` : "scale(1)",
            }}
          />
        ))}
      </div>
      <p className="mt-5 min-h-12 text-[12px] leading-relaxed text-muted-foreground" aria-live="polite">
        {twin
          ? "After correction, each block keeps only what is distinctive about it: indie strips, Latin corridors, old money, night economies."
          : "Raw affinity tracks popularity (r = 0.97): every query lights up where people are, so neighbourhoods look ~0.95 alike."}
      </p>
    </div>
  );
}
