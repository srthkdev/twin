import { cn } from "@/lib/utils";

export const tasteLabel = (value: number) => value >= 1 ? "much more than city average" : value > 0 ? "more than city average" : value <= -1 ? "much less than city average" : value < 0 ? "less than city average" : "at city average";

export function Meter({ value, max = 1, width, align = "left", centered = false, className, tone = "accent" }: {
  value: number; max?: number; width?: number; align?: "left" | "right"; centered?: boolean; className?: string; tone?: "accent" | "fg" | "dim";
}) {
  const n = Math.min(1, Math.abs(value) / (max || 1)) * (centered ? 50 : 100);
  const color = tone === "accent" ? "bg-primary" : tone === "fg" ? "bg-foreground" : "bg-dim";
  const right = centered ? value < 0 : align === "right";
  return (
    <span aria-hidden="true" className={cn("relative inline-block h-2 w-full bg-line-strong align-middle", className)} style={width == null ? undefined : { width: `${width}ch` }}>
      <span className={cn("absolute inset-y-0", color)} style={{
        width: `${n}%`, minWidth: value === 0 ? 0 : 1,
        [right ? "right" : "left"]: centered ? "50%" : 0,
      }} />
      {centered && <span className="absolute -inset-y-1 left-1/2 w-px bg-foreground/60" />}
    </span>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("label", className)}>{children}</div>;
}
