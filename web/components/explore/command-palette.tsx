"use client";
import { useEffect } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Compass, MapPin } from "lucide-react";
import type { DataSet } from "@/lib/types";

export function CommandPalette({ open, onOpenChange, ds, sourceCity, onPickHood, onPickCity }: {
  open: boolean; onOpenChange: (o: boolean) => void; ds: DataSet; sourceCity: string; onPickHood: (id: string) => void; onPickCity: (id: string) => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); onOpenChange(!open); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onOpenChange]);
  const run = (fn: () => void) => { fn(); onOpenChange(false); };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search neighbourhoods and cities" className="border border-white/10 bg-[#0d0f16]/95 sm:max-w-xl">
      <CommandInput placeholder="Search a neighbourhood or city…" />
      <CommandList className="max-h-[360px]">
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Find twins in…">
          {ds.cities.filter((c) => c.id !== sourceCity).map((c) => (
            <CommandItem key={c.id} value={`city ${c.name}`} onSelect={() => run(() => onPickCity(c.id))}><Compass className="size-4 text-cyan-300" /> {c.name}</CommandItem>
          ))}
        </CommandGroup>
        {ds.cities.map((c) => (
          <CommandGroup key={c.id} heading={c.name}>
            {ds.hoods.filter((h) => h.city === c.id).map((h) => (
              <CommandItem key={h.id} value={`${h.name} ${c.name}`} onSelect={() => run(() => onPickHood(h.id))}><MapPin className="size-4 text-violet-300" /> {h.name}</CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
