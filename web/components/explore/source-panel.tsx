"use client";
import { useMemo, useState } from "react";
import { TraitList } from "./trait-chip";
import { Label } from "./meter";
import { addCity, cityCode } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { City, DataSet, Hood } from "@/lib/types";
import type { Pair } from "@/hooks/use-pairs";

export interface SourcePin { kind: "pin"; city: string; lon: number; lat: number; label: string; top: number[]; vec: number[] }

export function SourcePanel({ ds, source, pin, toCity, onPickHood, onPickCity, onPickPair, onCityAdded, sourceCityId, recent, popular }: {
  ds: DataSet; source: Hood | null; pin: SourcePin | null; toCity: string | null; sourceCityId: string;
  onPickHood: (id: string) => void; onPickCity: (id: string | null) => void; onPickPair: (p: Pair) => void; onCityAdded: (city: City) => void;
  recent: Pair[]; popular: Pair[];
}) {
  const [newCity, setNewCity] = useState("");
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const submitCity = async () => {
    const name = newCity.trim();
    if (!name || adding) return;
    setAdding(true); setAddError(null); setProgress("starting");
    try {
      const c = await addCity(name, (p) => setProgress(`${p.stage}${p.total ? ` ${p.done}/${p.total}` : ""}`));
      setNewCity("");
      onCityAdded(c);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add city");
    } finally {
      setAdding(false); setProgress(null);
    }
  };
  const [q, setQ] = useState("");
  const city = (id: string) => ds.cities.find((c) => c.id === id) as City;
  const hoodName = (id: string) => ds.hoods.find((h) => h.id === id)?.name;
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return {
      hoods: ds.hoods.filter((h) => h.name.toLowerCase().includes(s)).slice(0, 8),
      cities: ds.cities.filter((c) => c.name.toLowerCase().includes(s) || cityCode(c).toLowerCase() === s),
    };
  }, [ds, q]);
  const pairRow = (p: Pair) => {
    const from = hoodName(p.from), to = city(p.to);
    if (!from || !to) return null;
    const on = source?.id === p.from && toCity === p.to && !pin;
    return (
      <li key={`${p.from}>${p.to}`}>
        <button onClick={() => onPickPair(p)} aria-current={on || undefined}
          className={cn("flex w-full items-baseline gap-1.5 px-4 py-[3px] text-left transition-colors", on ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
          <span className="truncate">{from.toLowerCase()}</span><span className="text-dim">→</span><span className="truncate text-foreground">{to.name.toLowerCase()}</span>
          {p.n != null && <span className="num ml-auto text-[10.5px] text-dim">{p.n}</span>}
        </button>
      </li>
    );
  };
  const vec = pin?.vec ?? source?.v ?? [];
  const topDims = pin ? pin.top : source?.top ?? [];

  return (
    <div className="flex h-full flex-col text-[12.5px]">
      {/* where from: one search over every neighbourhood and city; recent and most-opened pairs when idle */}
      <div className="border-b border-line px-4 pb-3 pt-4">
        <Label>from</Label>
        <label className="mt-2 flex items-center gap-2 border border-line bg-background px-2 py-1.5 focus-within:border-line-strong">
          <span className="text-dim">/</span>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="neighbourhood or city"
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); if (e.key === "Enter" && found?.hoods[0]) { onPickHood(found.hoods[0].id); setQ(""); } }}
            className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-dim"
            aria-label="Search neighbourhoods and cities"
          />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-[11px] text-dim hover:text-foreground">esc</button>}
        </label>
      </div>

      <div className="max-h-[34vh] min-h-16 overflow-y-auto border-b border-line py-1.5">
        {found ? (
          <ul aria-label="Search results">
            {found.cities.filter((c) => c.id !== sourceCityId).map((c) => (
              <li key={c.id}>
                <button onClick={() => { onPickCity(c.id); setQ(""); }} className="flex w-full items-baseline gap-2 px-4 py-[3px] text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <span className="text-primary">→</span><span className="flex-1 truncate">twins in {c.name.toLowerCase()}</span>
                </button>
              </li>
            ))}
            {found.hoods.map((h) => (
              <li key={h.id}>
                <button onClick={() => { onPickHood(h.id); setQ(""); }} className="flex w-full items-baseline gap-2 px-4 py-[3px] text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <span className="flex-1 truncate">{h.name}</span>
                  <span className="text-[10.5px] text-dim">{cityCode(city(h.city) ?? { id: h.city, name: h.city })}</span>
                </button>
              </li>
            ))}
            {!found.hoods.length && !found.cities.length && <li className="px-4 py-1 text-dim">no match · add it as a city below</li>}
          </ul>
        ) : (
          <>
            {recent.length > 0 && (<><div className="px-4 pb-1 pt-0.5"><Label>recent</Label></div><ul aria-label="Recent pairs">{recent.map(pairRow)}</ul></>)}
            {popular.length > 0 && (<><div className={cn("px-4 pb-1", recent.length ? "pt-3" : "pt-0.5")}><Label>most opened</Label></div><ul aria-label="Most opened pairs">{popular.map(pairRow)}</ul></>)}
            {!recent.length && !popular.length && <p className="px-4 py-1 text-[11.5px] text-dim">search above, or click any block on the map</p>}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* profile */}
        <section className="border-b border-line px-4 py-4">
          <Label>{pin ? "pin" : "profile"}</Label>
          <h2 className="mt-2 text-[17px] leading-tight tracking-[-0.02em] text-foreground">{pin ? pin.label : source?.name}</h2>
          <div className="mt-1 text-[11px] text-dim">
            {city(sourceCityId)?.name.toLowerCase()}{pin ? " · within 1.3 km of the pin" : source?.cells ? ` · ${source.cells} blocks` : ""}
          </div>
          {!pin && source?.blurb && <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{source.blurb}</p>}
          <div className="mt-4">
            <Label className="mb-1">stands out for</Label>
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">Compared with the rest of {city(sourceCityId)?.name ?? "the city"}.</p>
            <TraitList dims={topDims} vec={vec} basket={ds.basket} />
          </div>
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
                    <span className={cn("text-[11px]", on ? "text-primary" : "text-dim")}>{cityCode(c)}</span>
                    <span className="truncate text-muted-foreground"><span className="text-foreground">{c.name.toLowerCase()}</span>{name && <span className="text-dim"> → {name}</span>}</span>
                    {top && <span className="num whitespace-nowrap text-[11px] text-muted-foreground">{Math.round(top.score * 100)}% match</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <form onSubmit={(e) => { e.preventDefault(); void submitCity(); }} className="mt-3">
            <label className="flex items-center gap-2 border border-line bg-background px-2 py-1.5 focus-within:border-line-strong">
              <span className="text-dim">+</span>
              <input value={newCity} onChange={(e) => setNewCity(e.target.value)} disabled={adding} placeholder="add city"
                className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-dim disabled:opacity-60" aria-label="Add a city" />
            </label>
            {progress && <p className="cursor-block mt-1.5 text-[11px] text-dim" aria-live="polite">{progress}</p>}
            {addError && <p className="mt-1.5 text-[11px] leading-relaxed text-destructive">{addError}</p>}
          </form>
          <p className="mt-4 text-[11px] leading-relaxed text-dim">click any block of {city(sourceCityId)?.name.toLowerCase()} on the map to use it as the starting point.</p>
        </section>
      </div>
    </div>
  );
}
