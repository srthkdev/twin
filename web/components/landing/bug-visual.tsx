"use client";
import { useJson } from "@/hooks/use-json";
import { useMemo, useState } from "react";
import { useDataset } from "@/hooks/use-dataset";
import { isLive, loadCells } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { PackedCells } from "@/lib/types";

export function BugVisual() {
  const { ds, error } = useDataset();

  const [taste, setTaste] = useState(true);
  const city = ds?.cities.find((c) => !isLive(c));
  const item = ds?.basket.find((b) => b.id === "artist-kendrick-lamar") ?? ds?.basket.find((b) => b.kind === "artist");
  const { data: cells = null, error: cellsError } = useJson<PackedCells>(city ? `twin:cells:${city.id}` : null, () => loadCells(city!.id));
  const failed = !!cellsError;
  const points = useMemo(() => {
    if (!cells || !item || !cells.n) return [];
    const lon = Array.from(cells.lon), lat = Array.from(cells.lat);
    const left = Math.min(...lon), right = Math.max(...lon), bottom = Math.min(...lat), top = Math.max(...lat);
    const values = lon.map((_, i) => taste ? cells.v[i * cells.dim + item.i] : cells.d[i]);
    const low = taste ? 0 : Math.min(...values), high = Math.max(...values);
    return lon.map((x, i) => ({
      x: 8 + (x - left) / (right - left || 1) * 464,
      y: 8 + (top - lat[i]) / (top - bottom || 1) * 264,
      strength: Math.max(0, Math.min(1, (values[i] - low) / (high - low || 1))),
      above: values[i] > 0,
    }));
  }, [cells, item, taste]);

  return (
    <figure className="border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Compare popularity and taste" className="inline-flex border border-line-strong text-[12px]">
          {[{ label: "popularity", value: false, hint: "How busy each block is in Qloo's data." }, { label: "taste", value: true, hint: "Where the selected taste is stronger after accounting for busyness." }].map((option) => (
            <button key={option.label} type="button" aria-pressed={taste === option.value} title={option.hint} onClick={() => setTaste(option.value)}
              className={cn("px-3 py-1.5 transition-colors", taste === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>
          ))}
        </div>
        <span className="text-[11px] text-dim">{city?.name ?? "Qloo blocks"}</span>
      </div>
      {points.length ? <svg viewBox="0 0 480 280" role="img" aria-label={taste ? `${item?.label} taste across actual blocks in ${city?.name}` : `Qloo popularity across actual blocks in ${city?.name}`} className="mt-5 w-full">
        {points.map((point, i) => <rect key={cells!.g[i]} x={point.x} y={point.y} width="4" height="4" fill={taste && point.above ? "var(--primary)" : "var(--foreground)"} opacity={0.08 + point.strength * 0.92} />)}
      </svg> : <div className="mt-5 flex aspect-[12/7] items-center justify-center text-[12px] text-dim">{failed || error ? "Could not load the Qloo blocks." : "Loading actual Qloo blocks…"}</div>}
      <figcaption className="mt-5 text-[12px] leading-relaxed text-muted-foreground">
        {taste ? `Where ${item?.label ?? "this taste"} stands out after accounting for how busy each block is.` : "Popularity highlights busy blocks, whatever taste you ask about."}
        <span className="mt-2 block text-[11px] text-dim">Each square is a real Qloo block{cells ? ` · ${cells.n.toLocaleString("en-US")} blocks` : ""}. Brighter means stronger.</span>
      </figcaption>
    </figure>
  );
}
