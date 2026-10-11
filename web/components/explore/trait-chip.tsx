import { groupOf } from "@/lib/groups";
import type { BasketItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TraitChip({ item, className }: { item: BasketItem; className?: string }) {
  const g = groupOf(item.group);
  const Icon = g.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-1.5 pr-2.5 text-xs text-white/90", className)}>
      <Icon className="size-3.5" style={{ color: g.color }} aria-hidden />
      {item.label}
    </span>
  );
}

export function GroupedTraits({ dims, basket }: { dims: number[]; basket: BasketItem[] }) {
  const by = new Map<string, BasketItem[]>();
  for (const i of dims) { const b = basket[i]; if (b) (by.get(b.group) ?? by.set(b.group, []).get(b.group)!).push(b); }
  return (
    <div className="space-y-2.5">
      {[...by.entries()].map(([g, items]) => {
        const gi = groupOf(g);
        return (
          <div key={g}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-white/40"><gi.icon className="size-3" style={{ color: gi.color }} />{gi.label}</div>
            <div className="flex flex-wrap gap-1.5">{items.map((b) => <TraitChip key={b.id} item={b} />)}</div>
          </div>
        );
      })}
    </div>
  );
}
