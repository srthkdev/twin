"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Mode } from "@/components/map/explore-map";

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opts: { v: Mode; l: string }[] = [{ v: "raw", l: "Raw Qloo" }, { v: "twin", l: "Twin" }];
  return (
    <div role="radiogroup" aria-label="Colour mode" className="glass relative inline-flex rounded-2xl p-1">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={mode === o.v} onClick={() => onChange(o.v)}
          className={cn("relative z-10 rounded-xl px-4 py-2 text-sm font-semibold transition-colors", mode === o.v ? "text-black" : "text-white/60 hover:text-white")}>
          {mode === o.v && <motion.span layoutId="mode-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className={cn("absolute inset-0 -z-10 rounded-xl", o.v === "twin" ? "bg-gradient-accent shadow-[0_0_28px_-4px_rgba(34,211,238,.7)]" : "bg-amber-300 shadow-[0_0_28px_-4px_rgba(251,191,36,.7)]")} />}
          {o.l}
        </button>
      ))}
    </div>
  );
}
