"use client";
import { useState } from "react";
import { MapPin, Search, ArrowRight } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { GroupedTraits } from "./trait-chip";
import { cn } from "@/lib/utils";
import type { BasketItem, City, DataSet, Hood } from "@/lib/types";

export interface SourcePin { kind: "pin"; city: string; lon: number; lat: number; label: string; top: number[]; vec: number[] }

export function SourcePanel({ ds, source, pin, toCity, onPickHood, onPickCity, sourceCityId }: {
  ds: DataSet; source: Hood | null; pin: SourcePin | null; toCity: string | null; sourceCityId: string;
  onPickHood: (id: string) => void; onPickCity: (id: string | null) => void;
}) {
  const [browse, setBrowse] = useState<string>(sourceCityId);
  const [prev, setPrev] = useState(sourceCityId);
  if (prev !== sourceCityId) { setPrev(sourceCityId); setBrowse(sourceCityId); }
  const hoods = ds.hoods.filter((h) => h.city === browse);
  const city = (id: string) => ds.cities.find((c) => c.id === id) as City;
  const topDims = pin ? pin.top : source?.top ?? [];

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/40">From</div>
        <div role="tablist" aria-label="Source city" className="flex flex-wrap gap-1">
          {ds.cities.map((c) => (
            <button key={c.id} role="tab" aria-selected={browse === c.id} onClick={() => setBrowse(c.id)}
              className={cn("rounded-lg px-2.5 py-1 text-xs transition", browse === c.id ? "bg-white/15 text-white" : "bg-white/[0.04] text-white/55 hover:text-white")}>{c.name}</button>
          ))}
        </div>
        <Command className="mt-2 rounded-xl border border-white/10 bg-black/30">
          <CommandInput placeholder={`Search ${city(browse)?.name} neighbourhoods…`} />
          <CommandList className="max-h-40">
            <CommandEmpty>No neighbourhood found.</CommandEmpty>
            {hoods.map((h) => (
              <CommandItem key={h.id} value={h.name} onSelect={() => onPickHood(h.id)} className={cn(source?.id === h.id && !pin && "bg-white/10")}>
                <Search className="size-3.5 opacity-40" /> {h.name}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-violet-500/10 to-transparent p-4">
        <div className="flex items-start gap-2">
          <MapPin className="mt-1 size-4 text-violet-300" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold leading-tight">{pin ? pin.label : source?.name}</div>
            <div className="text-xs text-white/50">{city(sourceCityId)?.name}{pin ? " · custom pin (1.3 km blend)" : ""}</div>
          </div>
        </div>
        {!pin && source?.blurb && <p className="mt-2 text-sm text-white/60">{source.blurb}</p>}
        <div className="mt-3"><GroupedTraits dims={topDims.slice(0, 6)} basket={ds.basket as BasketItem[]} /></div>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/40">Find its twin in</div>
        <div className="grid grid-cols-2 gap-1.5">
          {ds.cities.filter((c) => c.id !== sourceCityId).map((c) => (
            <button key={c.id} onClick={() => onPickCity(toCity === c.id ? null : c.id)} aria-pressed={toCity === c.id}
              className={cn("group flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition",
                toCity === c.id ? "border-transparent bg-gradient-accent font-semibold text-black shadow-[0_0_24px_-6px_rgba(34,211,238,.8)]" : "border-white/10 bg-white/[0.04] text-white/80 hover:border-violet-400/50 hover:bg-white/[0.08]")}>
              {c.name}<ArrowRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/40">Tip: click any cell in {city(sourceCityId)?.name} to drop a pin and find the twin of an arbitrary block.</p>
      </div>
    </div>
  );
}
