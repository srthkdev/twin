import { groupOf } from "@/lib/groups";
import type { BasketItem } from "@/lib/types";
import { Meter, tasteLabel } from "./meter";

/** What stands out locally, as traits and relative strength. */
export function TraitList({ dims, vec, basket, limit = 7 }: { dims: number[]; vec: number[]; basket: BasketItem[]; limit?: number }) {
  const rows = dims.slice(0, limit).map((i) => ({ item: basket[i], value: vec[i] ?? 0 })).filter((r) => r.item);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <table className="w-full table-fixed text-[12px]" aria-label="Distinctive local tastes">
      <thead>
        <tr>
          <th className="w-10"><span className="sr-only">Group</span></th>
          <th><span className="sr-only">Taste</span></th>
          <th className="w-28 pb-1 pl-2 font-normal">
            <div className="flex justify-between text-[9.5px] text-muted-foreground"><span>← less</span><span>avg</span><span>more →</span></div>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ item, value }) => (
          <tr key={item.id} className="h-7">
            <td className="text-[10.5px] text-dim">{groupOf(item.group).short}</td>
            <td className="truncate pr-2 text-foreground" title={item.label}>{item.label}</td>
            <td className="pl-2" title={`${item.label}: ${tasteLabel(value)}`}><span className="sr-only">{tasteLabel(value)}</span><Meter value={value} max={max} centered tone="fg" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** @deprecated kept for older imports */
export function GroupedTraits({ dims, basket }: { dims: number[]; basket: BasketItem[] }) {
  return <TraitList dims={dims} vec={dims.map(() => 1)} basket={basket} />;
}
