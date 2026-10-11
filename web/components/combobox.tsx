"use client";
import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ComboOption { value: string; label: string; group?: string; keywords?: string[] }

export function Combobox({ value, onChange, options, placeholder, searchPlaceholder, className, ariaLabel }: {
  value: string; onChange: (v: string) => void; options: ComboOption[]; placeholder: string; searchPlaceholder?: string; className?: string; ariaLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const sel = options.find((o) => o.value === value);
  const groups = React.useMemo(() => {
    const m = new Map<string, ComboOption[]>();
    for (const o of options) { const g = o.group ?? ""; (m.get(g) ?? m.set(g, []).get(g)!).push(o); }
    return [...m.entries()];
  }, [options]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button" role="combobox" aria-haspopup="listbox" aria-controls="combo-list" aria-expanded={open} aria-label={ariaLabel}
          className={cn(
            "group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2 text-left font-semibold text-white outline-none transition hover:border-violet-400/60 hover:bg-white/10 hover:shadow-[0_0_30px_-8px_rgba(139,92,246,.9)] focus-visible:border-cyan-300/70",
            className,
          )}
        >
          <span className={cn("truncate", !sel && "text-muted-foreground")}>{sel?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50 transition group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="glass w-[min(320px,90vw)] border-white/10 bg-[#0d0f16]/95 p-0 text-white">
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? "Search…"} />
          <CommandList className="max-h-72">
            <CommandEmpty>No match.</CommandEmpty>
            {groups.map(([g, opts]) => (
              <CommandGroup key={g} heading={g || undefined}>
                {opts.map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.group ?? ""} ${(o.keywords ?? []).join(" ")}`} onSelect={() => { onChange(o.value); setOpen(false); }}>
                    <Check className={cn("size-4", o.value === value ? "opacity-100 text-cyan-300" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
