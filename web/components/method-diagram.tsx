"use client";
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The method as a physical stack: one city grid per step, floating in isometric space.
 * Hover (or focus) a layer or its caption to lift it out of the stack and read what that step does.
 */
const N = 8;
function grid(seed: number, f: (x: number, y: number, r: number) => number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: N * N }, (_, i) => f(i % N, Math.floor(i / N), rnd()));
}

const STEPS = [
  { k: "raw", title: "raw affinity", stat: "r = 0.97 with popularity", body: "One Qloo heatmap per basket item. Busy cells score high for everything — the centre lights up whatever you ask for." },
  { k: "base", title: "− cell baseline", stat: "mean rank over 116 items", body: "Each cell's average percentile across the whole basket. This is the part every item shares: how much activity the cell has." },
  { k: "lift", title: "= lift", stat: "z-scored within the city", body: "What is left is distinctive: a pocket that over-indexes on this item more than on everything else. Communities separate." },
  { k: "print", title: "fingerprint → cosine", stat: "116 dims per neighbourhood", body: "Stack the lift for every item and average the cells within 1.3 km. Two places are twins when their fingerprints point the same way." },
] as const;

const CELL = 26, GAP = 3, SIZE = N * (CELL + GAP) - GAP, LIFT = 64;

export function MethodDiagram() {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const [auto, setAuto] = useState(0);
  useEffect(() => {
    if (reduce || hover !== null) return;
    const t = setInterval(() => setAuto((a) => (a + 1) % STEPS.length), 2600);
    return () => clearInterval(t);
  }, [reduce, hover]);
  const active = hover ?? auto;

  const blob = (x: number, y: number) => Math.exp(-(((x - 3.5) ** 2 + (y - 3.5) ** 2) / 7));
  const pockets = (x: number, y: number) => (x >= 5 && y <= 2 ? 0.55 : 0) + (x <= 1 && y >= 5 ? 0.4 : 0) + (x === 3 && y === 6 ? 0.35 : 0);
  const raw = useMemo(() => grid(11, (x, y, r) => Math.min(1, blob(x, y) * 0.8 + pockets(x, y) * 0.6 + r * 0.08)), []);
  const base = useMemo(() => grid(11, (x, y) => Math.min(1, blob(x, y) * 0.8 + 0.06)), []);
  const lift = useMemo(() => raw.map((v, i) => Math.min(1, Math.max(0, (v - base[i]) * 2.4))), [raw, base]);
  const bars = useMemo(() => Array.from({ length: N }, (_, i) => 0.15 + (((i * 37) % 13) / 13) * 0.85), []);

  const fill = (step: number, v: number) =>
    step === 2 ? `hsl(34 ${50 + v * 40}% ${9 + v * 50}%)` : `hsl(45 5% ${9 + v * (step === 1 ? 46 : 60)}%)`;

  const layers = [raw, base, lift];

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* the stack */}
      <div className="relative h-[480px]" style={{ perspective: 1600 }} aria-hidden>
        <div
          className="absolute left-1/2 top-[66%]"
          style={{ transformStyle: "preserve-3d", transform: "translate(-50%, -50%) rotateX(58deg) rotateZ(-38deg)", width: SIZE, height: SIZE }}
        >
          {STEPS.map((s, li) => {
            const on = active === li;
            const z = li * LIFT + (on ? 22 : 0);
            return (
              <div
                key={s.k}
                onMouseEnter={() => setHover(li)} onMouseLeave={() => setHover(null)}
                className="absolute inset-0 cursor-default transition-[transform,opacity] duration-500 ease-out"
                style={{ transform: `translateZ(${z}px)`, transformStyle: "preserve-3d", opacity: active === null || on ? 1 : 0.38 }}
              >
                {/* plate */}
                <div className={cn("absolute -inset-2.5 border transition-colors duration-500", on ? "border-primary bg-[#14130f]/90" : "border-line-strong bg-[#10100e]/80")} />
                {li < 3 ? (
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${N}, ${CELL}px)`, gap: GAP }}>
                    {layers[li].map((v, i) => (
                      <div key={i} className="transition-[background-color] duration-500" style={{ width: CELL, height: CELL, background: fill(li, v) }} />
                    ))}
                  </div>
                ) : (
                  // fingerprint: a bar per basket item, lit cell by cell on the top plate
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${N}, ${CELL}px)`, gap: GAP }}>
                    {Array.from({ length: N * N }, (_, i) => {
                      const col = i % N, row = N - 1 - Math.floor(i / N);
                      const lit = row < Math.round(bars[col] * (on ? N : N * 0.75));
                      return <div key={i} className="transition-[background-color] duration-500" style={{ width: CELL, height: CELL, background: lit ? `hsl(34 85% ${30 + (row / N) * 30}%)` : "hsl(45 5% 9%)" }} />;
                    })}
                  </div>
                )}
                {/* step tag on the plate corner */}
                <div className={cn("absolute -left-2.5 -top-8 px-1.5 py-0.5 text-[11px] transition-colors", on ? "bg-primary text-primary-foreground" : "border border-line-strong bg-background text-muted-foreground")}>
                  {String(li + 1).padStart(2, "0")} {s.k}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* captions */}
      <ol className="border-t border-line">
        {STEPS.map((s, i) => {
          const on = active === i;
          return (
            <li key={s.k}>
              <button
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                className={cn("grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-2 border-b border-l-2 border-b-line py-4 pl-3 pr-2 text-left transition-colors",
                  on ? "border-l-primary bg-raised" : "border-l-transparent hover:bg-accent")}
              >
                <span className={cn("num text-[12px]", on ? "text-primary" : "text-dim")}>{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className={cn("text-[14px]", on ? "text-foreground" : "text-muted-foreground")}>{s.title}</span>
                    <span className="text-[11px] text-dim">{s.stat}</span>
                  </span>
                  <span className={cn("mt-1.5 block text-[12px] leading-relaxed transition-colors", on ? "text-muted-foreground" : "text-dim")}>{s.body}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
