import { groupOf } from "@/lib/groups";
import type { BasketItem } from "@/lib/types";
import { Meter } from "./meter";

/** What a place over-indexes on, as a ranked table: group · item · z-score · meter. */
export function TraitList({ dims, vec, basket, limit = 7 }: { dims: number[]; vec: number[]; basket: BasketItem[]; limit?: number }) {
  const rows = dims.slice(0, limit).map((i) => ({ item: basket[i], z: vec[i] ?? 0 })).filter((r) => r.item);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.z)));
  return (
    <table className="w-full text-[12px]">
      <tbody>
        {rows.map(({ item, z }) => (
          <tr key={item.id} className="h-6">
            <td className="w-12 text-[10.5px] text-dim">{groupOf(item.group).short}</td>
            <td className="max-w-0 truncate pr-2 text-foreground">{item.label}</td>
            <td className="num w-11 text-right text-muted-foreground">{z >= 0 ? "+" : ""}{z.toFixed(1)}</td>
            <td className="w-[76px] pl-2 text-[10px]"><Meter value={z} max={max} width={8} /></td>
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
