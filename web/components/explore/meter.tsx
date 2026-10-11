import { cn } from "@/lib/utils";

/** A text meter: `████░░░░` — reads as data, sits on the mono baseline, costs nothing to render. */
export function Meter({ value, max = 1, width = 10, align = "left", className, tone = "accent" }: {
  value: number; max?: number; width?: number; align?: "left" | "right"; className?: string; tone?: "accent" | "fg" | "dim";
}) {
  const n = Math.max(0, Math.min(width, Math.round((Math.abs(value) / (max || 1)) * width)));
  const fill = "█".repeat(n), rest = "░".repeat(width - n);
  const color = tone === "accent" ? "text-primary" : tone === "fg" ? "text-foreground/80" : "text-dim";
  return (
    <span aria-hidden className={cn("whitespace-pre leading-none tracking-[-0.06em]", className)}>
      {align === "right" ? <><span className="text-line-strong">{rest}</span><span className={color}>{fill}</span></>
        : <><span className={color}>{fill}</span><span className="text-line-strong">{rest}</span></>}
    </span>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("label", className)}>{children}</div>;
}
