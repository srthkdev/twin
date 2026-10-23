"use client";
import { useState } from "react";
import { useInterval } from "usehooks-ts";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * From question to decision, as four plates that light up in turn (the same rhythm as the method stack).
 * Hover a step to hold it.
 */
const STEPS = [
  { k: "ask", title: "a job, not a prompt", stat: "open · expand · move · tour", body: "Pick what you are deciding. The agent loads the matching playbook: which evidence to pull and in what order." },
  { k: "research", title: "live data, in parallel", stat: "29 tools · Qloo first", body: "Qloo answers every taste question. Overture counts what physically exists and where 10,000 chains already are. Twin's grid matches blocks across 24 cities." },
  { k: "check", title: "every number traced", stat: "rejected if not in the data", body: "Busy blocks are ranked first, then taste, then competition. A chart or headline number the tools never returned is sent back to the agent to fix." },
  { k: "report", title: "a decision you can share", stat: "verdict · map · PDF", body: "GO, WATCH or SKIP with the market, customers, candidates, competitors, a benchmark abroad and a validation plan. The shortlist is numbered on the map." },
] as const;

const JOBS = ["Where in Berlin should I open a natural wine bar?", "My café works in Shoreditch. Where in Lisbon next?", "I love Silver Lake. Which part of Berlin?", "Where should Peso Pluma play in Europe?"];
const TOOLS: [string, string][] = [["qloo", "opportunity"], ["overture", "venue_supply"], ["qloo", "scene"], ["twin", "find_twins"], ["overture", "brand_whitespace"]];
const CHECKS: [string, boolean][] = [["58% match · Alvalade", true], ["78 cafés within 1 km", true], ["busy · 98th percentile", true], ["78% average twin", false]];

export function AgentDiagram() {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  useInterval(() => setTick((t) => t + 1), reduce || hover !== null ? null : 700);
  const active = hover ?? Math.floor(tick / 4) % STEPS.length;
  const beat = tick % 4; // progress inside the active step

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3" aria-hidden>
        {STEPS.map((s, i) => {
          const on = active === i;
          return (
            <div key={s.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className={cn("relative h-[210px] overflow-hidden border p-3.5 transition-all duration-500", on ? "border-primary bg-[#14130f]" : "border-line-strong bg-[#10100e] opacity-50")}>
              <div className={cn("mb-3 inline-block px-1.5 py-0.5 text-[11px]", on ? "bg-primary text-primary-foreground" : "border border-line-strong text-muted-foreground")}>
                {String(i + 1).padStart(2, "0")} {s.k}
              </div>
              {i === 0 && (
                <div className="space-y-1.5 text-[11px]">
                  {["open a place", "expand", "move", "tour"].map((j, n) => (
                    <div key={j} className={cn("border px-2 py-1 transition-colors duration-300", on && n === Math.floor(tick / 16) % 4 ? "border-primary text-primary" : "border-line text-dim")}>{j}</div>
                  ))}
                </div>
              )}
              {i === 1 && (
                <div className="space-y-1 text-[10.5px]">
                  {TOOLS.map(([src, t], n) => {
                    const lit = on && n <= beat * 2 + 1;
                    return (
                      <div key={t} className={cn("flex items-center justify-between border px-2 py-[3px] transition-colors duration-300", lit ? "border-line-strong text-foreground" : "border-line text-dim")}>
                        <span>{t}</span><span className={cn("uppercase tracking-[0.1em]", lit && src === "qloo" ? "text-primary" : "")}>{src}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {i === 2 && (
                <div className="space-y-1.5 text-[11px]">
                  {CHECKS.map(([t, ok], n) => {
                    const shown = on && n <= beat;
                    return (
                      <div key={t} className={cn("flex items-center justify-between transition-opacity duration-300", shown ? "opacity-100" : "opacity-20")}>
                        <span className={ok ? "text-muted-foreground" : "text-muted-foreground line-through"}>{t}</span>
                        <span className={ok ? "text-primary" : "text-destructive"}>{ok ? "traced" : "rejected"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {i === 3 && (
                <div className="grid grid-cols-[1fr_88px] gap-2">
                  <div className="space-y-1.5">
                    <div className="border-l-2 border-primary bg-primary/10 px-2 py-1 text-[10px] text-primary">WATCH · Alvalade first</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      {[["58%", "match"], ["78", "cafés"]].map(([v, l]) => <div key={l} className="border border-line px-1.5 py-1"><div className="text-foreground">{v}</div><div className="text-dim">{l}</div></div>)}
                    </div>
                    <div className="space-y-1">{[0.9, 0.7, 0.5].map((w) => <div key={w} className="h-1.5 bg-line-strong" style={{ width: `${w * 100}%` }} />)}</div>
                  </div>
                  <div className="relative border border-line bg-[#0d0d0b]">
                    {[[30, 34, 1], [62, 58, 2], [40, 76, 3]].map(([x, y, n]) => (
                      <span key={n} className={cn("absolute grid size-4 place-items-center border text-[9px] transition-all duration-500", on && n <= beat + 1 ? "scale-100 opacity-100" : "scale-50 opacity-0",
                        n === 1 ? "border-primary bg-primary text-primary-foreground" : "border-primary bg-background text-primary")} style={{ left: `${x}%`, top: `${y}%` }}>{n}</span>
                    ))}
                  </div>
                </div>
              )}
              {i === 0 && on && <p className="absolute inset-x-3 bottom-3 truncate text-[10.5px] text-muted-foreground">“{JOBS[Math.floor(tick / 16) % JOBS.length]}”</p>}
            </div>
          );
        })}
      </div>

      <ol className="grid border-t border-line sm:grid-cols-2 sm:gap-x-6">
        {STEPS.map((s, i) => {
          const on = active === i;
          return (
            <li key={s.k}>
              <button onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                className={cn("grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-2 border-b border-l-2 border-b-line py-4 pl-3 pr-2 text-left transition-colors",
                  on ? "border-l-primary bg-raised" : "border-l-transparent hover:bg-accent")}>
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
