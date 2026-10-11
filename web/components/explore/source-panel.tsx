"use client";
import { useMemo, useState } from "react";
import { TraitList } from "./trait-chip";
import { Label } from "./meter";
import { CITY_CODES } from "@/lib/groups";
import { cn } from "@/lib/utils";
import type { City, DataSet, Hood } from "@/lib/types";

export interface SourcePin { kind: "pin"; city: string; lon: number; lat: number; label: string; top: number[]; vec: number[] }

export function SourcePanel({ ds, source, pin, toCity, onPickHood, onPickCity, sourceCityId }: {
  ds: DataSet; source: Hood | null; pin: SourcePin | null; toCity: string | null; sourceCityId: string;
  onPickHood: (id: string) => void; onPickCity: (id: string | null) => void;
}) {
  const [browse, setBrowse] = useState<string>(sourceCityId);
  const [prev, setPrev] = useState(sourceCityId);
  const [q, setQ] = useState("");
  if (prev !== sourceCityId) { setPrev(sourceCityId); setBrowse(sourceCityId); }
  const city = (id: string) => ds.cities.find((c) => c.id === id) as City;
  const hoods = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ds.hoods.filter((h) => (s ? h.name.toLowerCase().includes(s) : h.city === browse));
  }, [ds, browse, q]);
  const vec = pin?.vec ?? source?.v ?? [];
  const topDims = pin ? pin.top : source?.top ?? [];

  return (
    <div className="flex h-full flex-col text-[12.5px]">
      {/* where from */}
      <div className="border-b border-line px-4 pb-3 pt-4">
        <Label>from</Label>
        <div role="tablist" aria-label="Source city" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
          {ds.cities.map((c) => (
            <button key={c.id} role="tab" aria-selected={browse === c.id && !q} onClick={() => { setBrowse(c.id); setQ(""); }}
              className={cn("transition-colors", browse === c.id && !q ? "text-foreground underline decoration-primary underline-offset-4" : "text-dim hover:text-muted-foreground")}>
              {CITY_CODES[c.id] ?? c.name}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 border border-line bg-background px-2 py-1.5 focus-within:border-line-strong">
          <span className="text-dim">/</span>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="search all neighbourhoods"
            className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-dim"
            aria-label="Search neighbourhoods"
          />
        </label>
      </div>

      <ul className="max-h-[30vh] min-h-24 overflow-y-auto border-b border-line py-1" aria-label="Neighbourhoods">
        {hoods.map((h) => {
          const active = source?.id === h.id && !pin;
          return (
            <li key={h.id}>
              <button onClick={() => onPickHood(h.id)} aria-current={active || undefined}
                className={cn("flex w-full items-center gap-2 px-4 py-[3px] text-left transition-colors", active ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <span className={cn("w-2", active ? "text-primary" : "text-transparent")}>›</span>
                <span className="flex-1 truncate">{h.name}</span>
                {q && <span className="text-[10.5px] text-dim">{CITY_CODES[h.city]}</span>}
              </button>
            </li>
          );
        })}
        {!hoods.length && <li className="px-4 py-2 text-dim">no match</li>}
      </ul>

      <div className="flex-1 overflow-y-auto">
        {/* profile */}
        <section className="border-b border-line px-4 py-4">
          <Label>{pin ? "pin" : "profile"}</Label>
          <h2 className="mt-2 text-[17px] leading-tight tracking-[-0.02em] text-foreground">{pin ? pin.label : source?.name}</h2>
          <div className="mt-1 text-[11px] text-dim">
            {city(sourceCityId)?.name.toLowerCase()}{pin ? " · 1.3 km blend around the pin" : source ? ` · ${source.cells} cells` : ""}
          </div>
          {!pin && source?.blurb && <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{source.blurb}</p>}
          <div className="mt-4"><Label className="mb-1">over-indexes on</Label><TraitList dims={topDims} vec={vec} basket={ds.basket} /></div>
        </section>

        {/* where to */}
        <section className="px-4 py-4">
          <Label>twin in</Label>
          <ul className="mt-2">
            {ds.cities.filter((c) => c.id !== sourceCityId).map((c) => {
              const top = !pin && source ? ds.twins[source.id]?.[c.id]?.[0] : undefined;
              const name = top && ds.hoods.find((h) => h.id === top.hood)?.name;
              const on = toCity === c.id;
              return (
                <li key={c.id}>
                  <button onClick={() => onPickCity(on ? null : c.id)} aria-pressed={on}
                    className={cn("grid w-full grid-cols-[2.6rem_minmax(0,1fr)_auto] items-baseline gap-2 border-l-2 py-1.5 pl-2 pr-1 text-left transition-colors",
                      on ? "border-primary bg-raised" : "border-transparent hover:bg-accent")}>
                    <span className={cn("text-[11px]", on ? "text-primary" : "text-dim")}>{CITY_CODES[c.id]}</span>
                    <span className="truncate text-muted-foreground"><span className="text-foreground">{c.name.toLowerCase()}</span>{name && <span className="text-dim"> → {name}</span>}</span>
                    {top && <span className="num text-[11px] text-muted-foreground">{top.score.toFixed(2)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-dim">click any cell of {city(sourceCityId)?.name.toLowerCase()} on the map to use that exact block as the source.</p>
        </section>
      </div>
    </div>
  );
}
