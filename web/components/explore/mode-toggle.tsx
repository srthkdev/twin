"use client";
import { cn } from "@/lib/utils";
import type { Mode } from "@/components/map/explore-map";

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opts: { v: Mode; l: string }[] = [{ v: "raw", l: "raw qloo" }, { v: "twin", l: "corrected" }];
  return (
    <div role="radiogroup" aria-label="Colour mode" className="inline-flex border border-line-strong bg-background/90 text-[11.5px]">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={mode === o.v} onClick={() => onChange(o.v)}
          className={cn("px-2.5 py-1 transition-colors",
            mode === o.v ? (o.v === "twin" ? "bg-primary text-primary-foreground" : "bg-foreground text-background") : "text-muted-foreground hover:text-foreground")}>
          {o.l}
        </button>
      ))}
    </div>
  );
}
