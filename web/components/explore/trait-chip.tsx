import { groupOf } from "@/lib/groups";
import type { BasketItem } from "@/lib/types";
import { Meter, tasteLabel } from "./meter";

/** What stands out locally, as traits and relative strength. */
export function TraitList({ dims, vec, basket, limit = 7 }: { dims: number[]; vec: number[]; basket: BasketItem[]; limit?: number }) {
  const rows = dims.slice(0, limit).map((i) => ({ item: basket[i], z: vec[i] ?? 0 })).filter((r) => r.item);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.z)));
  return (
    <table className="w-full text-[12px]" aria-label="Distinctive local tastes">
      <tbody>
        {rows.map(({ item, z }) => (
          <tr key={item.id} className="h-6">
            <td className="w-12 text-[10.5px] text-dim">{groupOf(item.group).short}</td>
            <td className="max-w-0 truncate pr-2 text-foreground">{item.label}</td>
            <td className="w-[76px] pl-2 text-[10px]" title={`${item.label}: ${tasteLabel(z)}`}><span className="sr-only">{tasteLabel(z)}</span><Meter value={z} max={max} width={8} tone={z >= 0 ? "accent" : "dim"} /></td>
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
