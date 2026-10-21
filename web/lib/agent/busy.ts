import { loadCore } from "./city-live";
import { geohash, geohashCenter, hav } from "./geo";
import { loadCellsFile } from "./node-data";
import { loadSupply, supplyTotal } from "./supply";
import { ToolError } from "./tool-kit";

export interface Busyness { pct: number; tier: "quiet" | "active" | "busy"; venues: number | null }
interface BusyCell { g: string; lat: number; lon: number; value: number }
interface BusyCity { supply: boolean; cells: BusyCell[]; values: number[]; byCell: Map<string, number> }
const mem = new Map<string, Promise<BusyCity>>();

async function loadBusy(city: string): Promise<BusyCity> {
  const [supply, raw] = await Promise.all([loadSupply(city), loadCellsFile(city).catch(() => null)]);
  const core = raw ? null : await loadCore(city);
  const grid = raw?.cells ?? core?.cells ?? [];
  const hasSupply = !!supply && Object.keys(supply.cells).length > 0;
  let cells: BusyCell[];
  if (hasSupply) {
    const counts = new Map(Object.entries(supply.cells).map(([g, row]) => [g, supplyTotal(supply, row)]));
    const byCell = new Map(grid.map((c) => [c.g, { g: c.g, lat: c.lat, lon: c.lon, value: counts.get(c.g) ?? 0 }]));
    for (const [g, value] of counts) if (!byCell.has(g)) { const [lat, lon] = geohashCenter(g); byCell.set(g, { g, lat, lon, value }); }
    cells = [...byCell.values()];
  } else {
    cells = raw ? raw.cells.map((c) => ({ ...c, value: c.d })) : (core?.cells ?? []).filter((c) => c.b != null).map((c) => ({ ...c, value: c.b! }));
  }
  if (!cells.length) throw new ToolError(`No busyness data for ${city}.`);
  return { supply: hasSupply, cells, values: cells.map((c) => c.value).sort((a, b) => a - b), byCell: new Map(cells.map((c) => [c.g, c.value])) };
}

/** City-relative venue density; omitted cells in the sparse supply grid have no counted venues. */
export async function busyAt(city: string, lat: number, lon: number): Promise<Busyness> {
  let pending = mem.get(city);
  if (!pending) {
    pending = loadBusy(city);
    mem.set(city, pending);
    pending.catch(() => mem.delete(city));
  }
  const data = await pending;
  let value = data.byCell.get(geohash(lat, lon));
  if (value == null && data.supply) value = 0;
  if (value == null) {
    let nearest = 2000;
    for (const c of data.cells) {
      const distance = hav(lat, lon, c.lat, c.lon);
      if (distance < nearest) { nearest = distance; value = c.value; }
    }
  }
  if (value == null) throw new ToolError(`No busyness data near that point in ${city}.`);
  let lo = 0, hi = data.values.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (data.values[mid] < value) lo = mid + 1; else hi = mid; }
  const pct = Math.round(100 * lo / data.values.length);
  return { pct, tier: pct < 40 ? "quiet" : pct < 75 ? "active" : "busy", venues: data.supply ? value : null };
}
