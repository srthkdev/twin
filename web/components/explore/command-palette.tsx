"use client";
import { useEffect } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search neighbourhoods and cities" className="rounded-none border border-line-strong bg-popover font-mono shadow-none sm:max-w-xl">
      <CommandInput placeholder="neighbourhood or city…" />
      <CommandList className="max-h-[360px]">
        <CommandEmpty>no match</CommandEmpty>
        <CommandGroup heading="find twins in">
          {ds.cities.filter((c) => c.id !== sourceCity).map((c) => (
            <CommandItem key={c.id} value={`city ${c.name}`} onSelect={() => run(() => onPickCity(c.id))}><span className="text-primary">→</span> {c.name.toLowerCase()}</CommandItem>
          ))}
        </CommandGroup>
        {ds.cities.map((c) => (
          <CommandGroup key={c.id} heading={c.name}>
            {ds.hoods.filter((h) => h.city === c.id).map((h) => (
              <CommandItem key={h.id} value={`${h.name} ${c.name}`} onSelect={() => run(() => onPickHood(h.id))}><span className="text-dim">·</span> {h.name}</CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
