"use client";
import { cn } from "@/lib/utils";
import type { Mode } from "@/components/map/explore-map";

export function ModeToggle({ mode, onChange, hasOpportunity = false }: { mode: Mode; onChange: (m: Mode) => void; hasOpportunity?: boolean }) {
  const opts: { v: Mode; l: string }[] = [{ v: "raw", l: "raw qloo" }, { v: "twin", l: "corrected" }, { v: "opportunity", l: "opportunity" }];
  return (
    <div role="radiogroup" aria-label="Colour mode" className="inline-flex border border-line-strong bg-background/90 text-[11.5px]">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={mode === o.v} onClick={() => onChange(o.v)}
          disabled={o.v === "opportunity" && !hasOpportunity}
          title={o.v === "opportunity" && !hasOpportunity ? "ask the agent for an opportunity map" : undefined}
          className={cn("px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:text-dim",
            mode === o.v ? (o.v === "raw" ? "bg-foreground text-background" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:text-foreground disabled:hover:text-dim")}>
          {o.l}
        </button>
      ))}
    </div>
  );
}
