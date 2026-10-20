"use client";
import { memo, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { stepLabel } from "./result-cards";

export interface ToolStep {
  id: string; name: string; args: unknown; pending: boolean; ok?: boolean; summary?: string;
  progress?: string; startedAt: number; endedAt?: number;
}

/** Where each step's answer comes from — so it's visible that Qloo does the taste work. */
const SOURCE: Record<string, string> = {
  local_scene: "qloo", audience: "qloo", cross_domain: "qloo", scene: "qloo", compare_taste: "qloo", trend: "qloo",
  tour: "qloo", opportunity: "qloo", add_city: "qloo",
  find_twins: "twin", explain_match: "twin", taste_profile: "twin", where_in_city: "twin", pin_twins: "twin",
  twins_anywhere: "twin", list_cities: "twin", search_hoods: "twin",
  venue_supply: "overture", geocode: "osm", web_search: "web", read_page: "web", wiki: "wiki", brief: "brief",
};

const SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
export function Spinner({ className }: { className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % SPIN.length), 80); return () => clearInterval(t); }, []);
  return <span aria-hidden className={cn("inline-block w-3 text-primary", className)}>{SPIN[i]}</span>;
}
/** The "working" indicator: three amber blocks in a wave and a shimmering label. CSS only, no timers. */
export function Pulse({ label, children, className }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2.5 text-[12px]", className)}>
      <span aria-hidden className="wave inline-flex h-4 items-end gap-[3px]"><i /><i /><i /></span>
      <span className="shimmer">{label}</span>{children}
    </span>
  );
}
export function Elapsed({ from, to }: { from: number; to?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (to) return; const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t); }, [to]);
  return <span className="num">{(((to ?? now) - from) / 1000).toFixed(1)}s</span>;
}

/** Consecutive tool calls as a compact checklist. Once the answer is done they fold into one line. */
export const ToolTrace = memo(function ToolTrace({ steps, folded }: { steps: ToolStep[]; folded?: boolean }) {
  if (!steps.length) return null;
  if (folded) {
    const secs = Math.max(...steps.map((x) => (x.endedAt ?? x.startedAt) - x.startedAt)) / 1000;
    const srcs = [...new Set(steps.map((x) => SOURCE[x.name] ?? "tool"))];
    const failed = steps.filter((x) => x.ok === false).length;
    return (
      <details className="group my-1.5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] text-dim hover:text-muted-foreground [&::-webkit-details-marker]:hidden">
          <span className="inline-block w-3 text-center transition-transform group-open:rotate-90">›</span>
          <span>{steps.length} step{steps.length > 1 ? "s" : ""} · {srcs.join(" · ")}{failed ? <span className="text-destructive"> · {failed} failed</span> : ""}</span>
          <span className="num ml-auto">{secs.toFixed(1)}s</span>
        </summary>
        <StepList steps={steps} />
      </details>
    );
  }
  return <StepList steps={steps} />;
});

function StepList({ steps }: { steps: ToolStep[] }) {
  return (
    <ol className="my-2 space-y-0.5">
      {steps.map((s) => {
        const src = SOURCE[s.name] ?? "tool";
        return (
          <li key={s.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-0.5 text-[11.5px] [&::-webkit-details-marker]:hidden">
                {s.pending ? <Spinner /> : <span className={cn("inline-block w-3 text-center", s.ok ? "text-primary" : "text-destructive")}>{s.ok ? "✓" : "✗"}</span>}
                <span className={cn("min-w-0 flex-1 truncate", s.pending ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                  {stepLabel(s.name, (s.args ?? {}) as Record<string, unknown>)}
                  {s.pending && s.progress && <span className="text-dim"> · {s.progress}</span>}
                </span>
                <span className={cn("shrink-0 text-[9.5px] uppercase tracking-wider", src === "qloo" ? "text-primary" : "text-dim")}>{src}</span>
                <span className="w-9 shrink-0 text-right text-[10.5px] text-dim"><Elapsed from={s.startedAt} to={s.endedAt} /></span>
              </summary>
              <div className="mb-1.5 ml-5 mt-0.5 border-l border-line pl-2 text-[10.5px] leading-relaxed">
                {s.summary && <div className={cn(s.ok ? "text-muted-foreground" : "text-destructive")}>{s.summary}</div>}
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-dim">{s.name}({JSON.stringify(s.args)})</pre>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
