"use client";
import type { ChartKind, ChartSpec, MapLink } from "@/lib/agent/report-types";

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function isChartSpec(x: unknown): x is ChartSpec {
  if (!record(x)) return false;
  const kinds: ChartKind[] = ["bar", "hbar", "line", "scatter", "table"];
  return typeof x.id === "string" && kinds.includes(x.kind as ChartKind) && typeof x.title === "string"
    && Array.isArray(x.labels) && x.labels.every((v) => typeof v === "string")
    && Array.isArray(x.series) && x.series.length > 0 && x.series.length <= 3
    && x.series.every((s) => record(s) && typeof s.name === "string" && Array.isArray(s.values) && s.values.every(finite))
    && Array.isArray(x.sources) && x.sources.every((v) => typeof v === "string");
}

const valueText = (v: number, unit?: string) => `${v.toLocaleString("en", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
const sourceText = (s: string) => ({
  find_twins: "twin match", twins_anywhere: "twin match", explain_match: "twin match",
  local_scene: "Qloo", scene: "Qloo", compare_taste: "Qloo", trend: "Qloo", opportunity: "Qloo",
  venue_supply: "Overture", geocode: "OpenStreetMap", web_search: "web search", wiki: "Wikipedia",
}[s] ?? s.replace(/_/g, " "));

export function Chart({ spec, onLink }: { spec: ChartSpec; onLink?: (link: MapLink) => void }) {
  const vals = spec.series.flatMap((s) => s.values).filter(Number.isFinite);
  const scale = Math.max(...vals.map((v) => Math.abs(v)), 1);
  const linkAt = (i: number) => spec.links?.[i] ?? null;
  return (
    <figure className="my-3 min-w-0 border border-line bg-card" aria-label={spec.title}>
      <figcaption className="border-b border-line px-3 py-2">
        <div className="text-[12px] font-medium text-foreground">{spec.title}</div>
        {spec.caption && <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{spec.caption}</div>}
      </figcaption>
      <div className="p-3">
        {spec.kind === "bar" && <BarChart spec={spec} scale={scale} linkAt={linkAt} onLink={onLink} />}
        {spec.kind === "hbar" && <HorizontalChart spec={spec} scale={scale} linkAt={linkAt} onLink={onLink} />}
        {spec.kind === "line" && <LineChart spec={spec} scale={scale} linkAt={linkAt} onLink={onLink} />}
        {spec.kind === "scatter" && <ScatterChart spec={spec} onLink={onLink} />}
        {spec.kind === "table" && <TableChart spec={spec} linkAt={linkAt} onLink={onLink} />}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {spec.series.length > 1 && spec.series.map((s, i) => <span key={s.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><i className={`size-1.5 ${i === 0 ? "bg-primary" : "bg-foreground/70"}`} />{s.name}</span>)}
          {spec.sources.length > 0 && <span className="ml-auto text-[10px] text-dim">source: {[...new Set(spec.sources.map(sourceText))].join(" · ")}</span>}
        </div>
      </div>
    </figure>
  );
}

function Mark({ value, scale, index }: { value: number; scale: number; index: number }) {
  return <span className="block h-full min-w-[2px]" style={{ width: `${Math.max(1.5, Math.abs(value) / scale * 100)}%`, background: index === 0 ? "var(--primary)" : "color-mix(in srgb, var(--foreground) 70%, transparent)" }} />;
}

function BarChart({ spec, scale, linkAt, onLink }: { spec: ChartSpec; scale: number; linkAt: (i: number) => MapLink | null; onLink?: (link: MapLink) => void }) {
  return (
    <div className="grid min-w-[420px] gap-x-3 text-[10.5px]" style={{ gridTemplateColumns: `minmax(7rem,1fr) repeat(${spec.series.length},minmax(3rem,1fr))` }}>
      <div className="label pb-2">{spec.axes?.x ?? ""}</div>
      {spec.series.map((s) => <div key={s.name} className="truncate pb-2 text-right text-dim">{s.name}</div>)}
      {spec.labels.map((label, i) => {
        const link = linkAt(i);
        return <div key={`${label}-${i}`} className="contents">
          <button type="button" disabled={!link || !onLink} onClick={() => link && onLink?.(link)} className="truncate py-1 text-left text-muted-foreground hover:text-primary disabled:cursor-default disabled:hover:text-muted-foreground">{label}</button>
          {spec.series.map((s, j) => <button key={s.name} type="button" disabled={!link || !onLink} onClick={() => link && onLink?.(link)} title={link ? `show ${label} on map` : undefined}
            className="flex items-center justify-end gap-1.5 py-1 disabled:cursor-default">
            <span className="num text-foreground">{valueText(s.values[i] ?? 0, spec.unit)}</span><span className="h-2 w-12 bg-line"><Mark value={s.values[i] ?? 0} scale={scale} index={j} /></span>
          </button>)}
        </div>;
      })}
    </div>
  );
}

function HorizontalChart({ spec, scale, linkAt, onLink }: { spec: ChartSpec; scale: number; linkAt: (i: number) => MapLink | null; onLink?: (link: MapLink) => void }) {
  return (
    <div className="space-y-2">
      {spec.labels.map((label, i) => {
        const link = linkAt(i);
        return <button type="button" key={`${label}-${i}`} disabled={!link || !onLink} onClick={() => link && onLink?.(link)} className="group block w-full text-left hover:text-primary disabled:cursor-default">
          <span className="mb-1 block max-w-full truncate text-[11px] text-muted-foreground group-hover:text-primary">{label}</span>
          {spec.series.map((s, j) => <div key={s.name} className="mb-1 grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-2">
            <span className="h-2 bg-line"><Mark value={s.values[i] ?? 0} scale={scale} index={j} /></span>
            <span className="num text-right text-[10.5px] text-foreground">{valueText(s.values[i] ?? 0, spec.unit)}</span>
          </div>)}
        </button>;
      })}
    </div>
  );
}

function LineChart({ spec, scale, linkAt, onLink }: { spec: ChartSpec; scale: number; linkAt: (i: number) => MapLink | null; onLink?: (link: MapLink) => void }) {
  const width = 760, height = 190, pad = 24;
  const min = Math.min(...spec.series.flatMap((s) => s.values), 0);
  const max = Math.max(...spec.series.flatMap((s) => s.values), 0);
  const x = (i: number) => pad + (spec.labels.length < 2 ? 0 : i / (spec.labels.length - 1) * (width - pad * 2));
  const y = (v: number) => height - pad - (v - min) / (max - min || scale) * (height - pad * 2);
  return <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 min-w-[480px] w-full" role="img" aria-label={`${spec.title}${spec.axes?.x ? ` by ${spec.axes.x}` : ""}`}>
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--line-strong)" />
      {spec.series.map((s, si) => <g key={s.name}>
        <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={si === 0 ? "var(--primary)" : "var(--muted-foreground)"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {s.values.map((v, i) => {
          const link = linkAt(i);
          return <g key={i} role={link && onLink ? "button" : undefined} tabIndex={link && onLink ? 0 : undefined}
            onClick={() => link && onLink?.(link)} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && link) { e.preventDefault(); onLink?.(link); } }}
            className={link && onLink ? "cursor-pointer" : ""}>
            <circle cx={x(i)} cy={y(v)} r="7" fill="transparent" />
            <circle cx={x(i)} cy={y(v)} r="3" fill={si === 0 ? "var(--primary)" : "var(--foreground)"} />
            <title>{`${spec.labels[i]}: ${valueText(v, spec.unit)}`}</title>
          </g>;
        })}
      </g>)}
    </svg>
    <div className="flex justify-between gap-2 text-[10px] text-dim">{spec.labels.map((label, i) => <button key={`${label}-${i}`} type="button" disabled={!linkAt(i) || !onLink} onClick={() => { const link = linkAt(i); if (link) onLink?.(link); }} className="max-w-[7rem] truncate text-left hover:text-primary disabled:cursor-default">{label}</button>)}</div>
  </div>;
}

function ScatterChart({ spec, onLink }: { spec: ChartSpec; onLink?: (link: MapLink) => void }) {
  const points = spec.points ?? [];
  if (!points.length || !points.every((p) => finite(p.x) && finite(p.y))) return <p className="text-[11px] text-dim">No points in this chart.</p>;
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
  const width = 700, height = 220, pad = 28;
  const x = (v: number) => pad + (v - minX) / (maxX - minX || 1) * (width - pad * 2);
  const y = (v: number) => height - pad - (v - minY) / (maxY - minY || 1) * (height - pad * 2);
  return <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-48 min-w-[460px] w-full" role="img" aria-label={spec.title}>
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--line-strong)" />
      <line x1={pad} x2={pad} y1={pad} y2={height - pad} stroke="var(--line-strong)" />
      {points.map((p, i) => <g key={`${p.label}-${i}`} role={p.link && onLink ? "button" : undefined} tabIndex={p.link && onLink ? 0 : undefined}
        onClick={() => p.link && onLink?.(p.link)} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && p.link) { e.preventDefault(); onLink?.(p.link); } }} className={p.link && onLink ? "cursor-pointer" : ""}>
        <circle cx={x(p.x)} cy={y(p.y)} r="10" fill="transparent" />
        <circle cx={x(p.x)} cy={y(p.y)} r="4" fill="var(--primary)" />
        <title>{`${p.label}: ${p.x}, ${p.y}`}</title>
      </g>)}
    </svg>
    <div className="mt-1 flex justify-between text-[10px] text-dim"><span>{spec.axes?.x}</span><span>{spec.axes?.y}</span></div>
    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px]">
      {points.map((p, i) => <li key={`${p.label}-${i}`}><button type="button" disabled={!p.link || !onLink} onClick={() => p.link && onLink?.(p.link)} className="max-w-full truncate text-left text-muted-foreground hover:text-primary disabled:cursor-default"><span className="num mr-1 text-primary">{i + 1}.</span>{p.label}<span className="num ml-1 text-dim">{p.x}, {p.y}</span></button></li>)}
    </ul>
  </div>;
}

function TableChart({ spec, linkAt, onLink }: { spec: ChartSpec; linkAt: (i: number) => MapLink | null; onLink?: (link: MapLink) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[400px] text-[11px]">
    <thead><tr><th className="border-b border-line-strong py-1.5 pr-3 text-left font-normal text-dim">{spec.axes?.x ?? ""}</th>{spec.series.map((s) => <th key={s.name} className="border-b border-line-strong px-2 py-1.5 text-right font-normal text-dim">{s.name}</th>)}</tr></thead>
    <tbody>{spec.labels.map((label, i) => <tr key={`${label}-${i}`}>
      <td className="border-b border-line py-1.5 pr-3"><button type="button" disabled={!linkAt(i) || !onLink} onClick={() => { const link = linkAt(i); if (link) onLink?.(link); }} className="max-w-full truncate text-left text-muted-foreground hover:text-primary disabled:cursor-default">{label}</button></td>
      {spec.series.map((s) => <td key={s.name} className="num border-b border-line px-2 py-1.5 text-right text-foreground">{valueText(s.values[i] ?? 0, spec.unit)}</td>)}
    </tr>)}</tbody>
  </table></div>;
}
