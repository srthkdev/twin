"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface ToolStep {
  id: string; name: string; args: unknown; pending: boolean; ok?: boolean; summary?: string;
  progress?: string; startedAt: number; endedAt?: number;
}

/** Where each tool's answer comes from — shown as a badge so it's obvious Qloo is doing the taste work. */
const SOURCE: Record<string, string> = {
  local_scene: "qloo", audience: "qloo", cross_domain: "qloo", scene: "qloo", compare_taste: "qloo", trend: "qloo",
  tour: "qloo", opportunity: "qloo+overture", add_city: "qloo+osm",
  find_twins: "twin", explain_match: "twin", taste_profile: "twin", where_in_city: "twin", pin_twins: "twin",
  twins_anywhere: "twin", list_cities: "twin", search_hoods: "twin",
  venue_supply: "overture", geocode: "osm", web_search: "web", read_page: "web", wiki: "wiki", brief: "brief",
};

const SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
function Spinner() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % SPIN.length), 90); return () => clearInterval(t); }, []);
  return <span aria-hidden className="text-primary">{SPIN[i]}</span>;
}
function Elapsed({ from, to }: { from: number; to?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (to) return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [to]);
  return <span className="num text-dim">{(((to ?? now) - from) / 1000).toFixed(1)}s</span>;
}

function argLine(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const fmt = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : JSON.stringify(v));
  const s = Object.entries(args as Record<string, unknown>).map(([k, v], i) => (i === 0 ? fmt(v) : `${k}: ${fmt(v)}`)).join(" · ");
  return s.length > 80 ? s.slice(0, 79) + "…" : s;
}

/** One block of consecutive tool calls, drawn as a timeline. */
export function ToolTrace({ steps }: { steps: ToolStep[] }) {
  if (!steps.length) return null;
  return (
    <ol className="my-2 border-l border-line-strong pl-3">
      {steps.map((s) => {
        const src = SOURCE[s.name] ?? "tool";
        return (
          <li key={s.id} className="relative py-1">
            <span aria-hidden className={cn("absolute -left-[16.5px] top-[9px] size-[7px] border", s.pending ? "border-primary bg-background" : s.ok ? "border-primary bg-primary" : "border-destructive bg-destructive")} />
            <details className="group">
              <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
                <span className={cn("shrink-0 border px-1 text-[9.5px] uppercase tracking-wider", src.startsWith("qloo") ? "border-primary/60 text-primary" : "border-line-strong text-dim")}>{src}</span>
                <span className="text-[11.5px] text-foreground">{s.name}</span>
                <span className="ml-auto shrink-0 text-[10.5px]">{s.pending ? <Spinner /> : null} <Elapsed from={s.startedAt} to={s.endedAt} /></span>
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words border border-line bg-card p-2 text-[10.5px] text-muted-foreground">{JSON.stringify(s.args, null, 2)}</pre>
            </details>
            <div className="mt-0.5 break-words text-[11px] leading-snug text-dim">{argLine(s.args)}</div>
            {s.pending && s.progress && <div className="mt-0.5 break-words text-[11px] text-muted-foreground">↳ {s.progress}</div>}
            {!s.pending && s.summary && <div className={cn("mt-0.5 break-words text-[11px]", s.ok ? "text-muted-foreground" : "text-destructive")}>→ {s.summary}</div>}
          </li>
        );
      })}
    </ol>
  );
}
