"use client";
import * as React from "react";
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
          type="button" role="combobox" aria-haspopup="listbox" aria-controls={`${ariaLabel}-list`} aria-expanded={open} aria-label={ariaLabel}
          className={cn(
            "inline-flex items-baseline gap-1.5 border-b border-dashed border-line-strong pb-px text-left text-foreground outline-none transition-colors hover:border-primary hover:text-primary focus-visible:border-primary",
            open && "border-primary text-primary",
            className,
          )}
        >
          <span className={cn("truncate", !sel && "text-muted-foreground")}>{sel?.label.toLowerCase() ?? placeholder}</span>
          <span className="text-[10px] text-dim">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(300px,90vw)] rounded-none border-line-strong bg-popover p-0 shadow-none">
        <Command className="rounded-none bg-transparent">
          <CommandInput placeholder={searchPlaceholder ?? "search…"} />
          <CommandList className="max-h-72">
            <CommandEmpty>no match</CommandEmpty>
            {groups.map(([g, opts]) => (
              <CommandGroup key={g} heading={g || undefined}>
                {opts.map((o) => (
                  <CommandItem
                    key={o.value} value={`${o.label} ${o.group ?? ""} ${(o.keywords ?? []).join(" ")}`}
                    onSelect={() => { onChange(o.value); setOpen(false); }}
                    className="rounded-none"
                  >
                    <span className={cn("w-3 text-primary", o.value !== value && "opacity-0")}>›</span>
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
