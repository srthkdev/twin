"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadEvals } from "@/lib/data";
import type { Evals } from "@/lib/types";

const f2 = (x?: number) => (x == null ? "--" : x.toFixed(2));

/** Three findings, stated plainly, including the one that doesn't flatter us. */
export function EvalsTeaser() {
  const [ev, setEv] = useState<Evals | null>(null);
  useEffect(() => { loadEvals().then(setEv).catch(() => {}); }, []);
  const c = ev?.census;
  const row = (city: string, id: string) => c?.rows.find((r) => r.city === city && r.id === id);
  const latin = row("los-angeles", "H01"), soul = row("new-york", "H12");

  const findings = [
    {
      k: "bias",
      claim: "raw Qloo says every neighbourhood is the same",
      a: { v: f2(ev?.rawCollapse.raw_mean_cos), l: "mean cross-city cosine, raw" },
      b: { v: f2(ev?.rawCollapse.twin_mean_cos), l: "after correction" },
      note: "Raw affinity follows a popularity baseline; subtracting it is what makes neighbourhoods distinguishable at all.",
    },
    {
      k: "census",
      claim: "the corrected maps track the census",
      a: { v: f2(latin?.rhoCorrected), l: "latin artists ↔ % hispanic, LA (raw " + f2(latin?.rhoRaw) + ")" },
      b: { v: f2(soul?.rhoCorrected), l: "soul food ↔ % black, NYC (raw " + f2(soul?.rhoRaw) + ")" },
      note: c ? `Spearman ρ across cells. Corrected beats raw on ${c.summary.correctedBeatsRaw} of ${c.summary.n} pre-registered tests; it is worse on affluence.` : "",
    },
    {
      k: "llm",
      claim: "an LLM already knows the famous twins",
      a: { v: f2(ev?.methods.llm.mrr), l: "MRR, Claude with no data" },
      b: { v: f2(ev?.methods.twin.hit3), l: "Twin hit@3 from data alone (random " + f2(ev?.methods.random.hit3) + ")" },
      note: "On published pairs the model wins — it has read the same blogs. Twin's agent pairs both: the LLM reasons, Qloo measures.",
    },
  ];

  return (
    <div className="border-t border-line">
      {findings.map((x, i) => (
        <div key={x.k} className="grid gap-4 border-b border-line py-6 md:grid-cols-[3rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <span className="num text-dim">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <p className="text-[15px] text-foreground">{x.claim}</p>
            <p className="mt-2 max-w-[48ch] text-[12px] leading-relaxed text-muted-foreground">{x.note}</p>
          </div>
          {[x.a, x.b].map((m, j) => (
            <div key={j}>
              <div className={`num text-[34px] leading-none tracking-tight ${j === 0 ? "text-foreground" : "text-primary"}`}>{m.v}</div>
              <div className="mt-2 text-[11px] text-dim">{m.l}</div>
            </div>
          ))}
        </div>
      ))}
      <div className="flex items-center justify-between pt-4 text-[12px]">
        <span className="text-dim">ground truth and hypotheses were committed before any result was computed</span>
        <Link href="/evals" className="link text-muted-foreground">all evals →</Link>
      </div>
    </div>
  );
}
