"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { defineCatalog, type Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { BLOCKS, blockSchema } from "./catalog";
import type { ChartSpec, MapLink } from "@/lib/agent/report-types";
import { Chart } from "@/components/agent/chart";
import { Markdown } from "@/lib/markdown";

export const webCatalog = defineCatalog(schema, {
  components: { ReportRoot: { props: z.object({}), slots: ["default"] }, ...BLOCKS },
  actions: {},
});

const ReportContext = createContext<{ charts: ChartSpec[]; onLink?: (link: MapLink) => void }>({ charts: [] });
export const verdictClass = (label: string) => ({
  GO: "border-primary/70 bg-primary/10 text-primary",
  WATCH: "border-primary/35 bg-primary/5 text-primary/80",
  SKIP: "border-destructive/60 bg-destructive/10 text-destructive",
  INFO: "border-line-strong bg-raised text-muted-foreground",
}[label.toUpperCase()] ?? "border-line-strong text-muted-foreground");

function PlaceLink({ link, children, className = "" }: { link?: MapLink; children: ReactNode; className?: string }) {
  const { onLink } = useContext(ReportContext);
  return link && onLink
    ? <button type="button" onClick={() => onLink(link)} title="Show on map" className={`text-left underline decoration-line-strong underline-offset-4 transition-colors hover:text-primary hover:decoration-primary ${className}`}>{children}</button>
    : <span className={className}>{children}</span>;
}

function Prose({ source }: { source: string }) {
  const { onLink } = useContext(ReportContext);
  return <div className="report-prose min-w-0 break-words"><Markdown source={source} variant="article" onLink={onLink} /></div>;
}

function ReportChart({ id, note }: { id: string; note?: string }) {
  const { charts, onLink } = useContext(ReportContext);
  const chart = charts.find((c) => c.id === id);
  return chart ? <div className="report-block min-w-0"><Chart spec={chart} onLink={onLink} />{note && <p className="mt-2 text-[11px] leading-relaxed text-dim">{note}</p>}</div> : null;
}

export const { registry: webRegistry } = defineRegistry(webCatalog, {
  components: {
    ReportRoot: ({ children }) => <div className="report-body min-w-0 space-y-5">{children}</div>,
    Verdict: ({ props }) => <section data-tour="verdict" aria-label={`Verdict: ${props.label}`} className={`report-block border-l-2 px-4 py-4 ${verdictClass(props.label)}`}>
      <div className="mb-2 text-[10px] font-medium tracking-[0.18em]">{props.label}</div>
      <p className="text-balance text-[clamp(15px,2vw,20px)] font-medium leading-relaxed tracking-[-0.025em]">{props.line}</p>
    </section>,
    KpiRow: ({ props }) => <dl className={`report-block grid gap-px border-y border-line bg-line ${props.items.length === 1 ? "grid-cols-1" : "grid-cols-2"} ${props.items.length === 3 ? "sm:grid-cols-3" : props.items.length === 4 ? "sm:grid-cols-4" : ""}`}>
      {props.items.map((item, i) => <div key={i} className="min-w-0 bg-card px-3 py-4">
        <dt className="label break-words">{item.label}</dt>
        <dd className="num mt-2 break-words text-[clamp(18px,2.5vw,27px)] leading-tight tracking-[-0.04em] text-foreground"><PlaceLink link={item.link}>{item.value}</PlaceLink></dd>
        {item.note && <dd className="mt-2 text-[10.5px] leading-relaxed text-dim">{item.note}</dd>}
      </div>)}
    </dl>,
    Heading: ({ props }) => <h2 className="report-heading border-t border-line pt-5 text-[16px] font-medium tracking-[-0.025em]">{props.text}</h2>,
    Paragraph: ({ props }) => <Prose source={props.markdown} />,
    Chart: ({ props }) => <ReportChart {...props} />,
    Ranking: ({ props }) => <section className="report-block min-w-0">
      <h3 className="label mb-3">{props.title}</h3>
      <ol className="divide-y divide-line border-y border-line">
        {props.items.map((item, i) => <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 py-3">
          <span className={`num pt-0.5 text-[11px] ${i === 0 ? "text-primary" : "text-dim"}`}>{String(i + 1).padStart(2, "0")}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12px]">
              <PlaceLink link={item.link} className="font-medium text-foreground">{item.label}</PlaceLink>
              {item.metric && <span className="num ml-auto text-right text-primary">{item.metric}</span>}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{item.reason}</p>
          </div>
        </li>)}
      </ol>
    </section>,
    Compare: ({ props }) => <section className="report-block min-w-0 border-y border-line">
      <div className="grid grid-cols-2 divide-x divide-line bg-card">
        {[props.left, props.right].map((side, i) => <h3 key={i} className="px-3 py-3 text-[13px] font-medium"><PlaceLink link={side.link}>{side.title}</PlaceLink></h3>)}
      </div>
      {props.rows.map((row, i) => <div key={i} className="border-t border-line">
        <div className="px-3 pb-1 pt-2 text-[10px] text-dim">{row.measure}</div>
        <div className="grid grid-cols-2 divide-x divide-line text-[12px] leading-relaxed text-muted-foreground">
          <div className="px-3 pb-3"><Prose source={row.left} /></div><div className="px-3 pb-3"><Prose source={row.right} /></div>
        </div>
      </div>)}
    </section>,
    Table: ({ props }) => <div className="report-block min-w-0 overflow-x-auto">
      <table className="w-full text-[11.5px] leading-relaxed">
        {props.caption && <caption className="mb-3 text-left text-[11px] text-dim">{props.caption}</caption>}
        <thead><tr>{props.columns.map((column, i) => <th key={i} scope="col" className={`border-b border-line-strong px-3 py-2 font-normal text-dim ${i ? "text-right" : "pl-0 text-left"}`}>{column}</th>)}</tr></thead>
        <tbody>{props.rows.map((row, i) => <tr key={i}>{props.columns.map((_, j) => <td key={j} className={`num border-b border-line px-3 py-2 text-muted-foreground ${j ? "text-right" : "pl-0 text-left text-foreground"}`}>{row[j] ?? ""}</td>)}</tr>)}</tbody>
      </table>
    </div>,
    Callout: ({ props }) => <aside className={`report-block border-l-2 bg-raised px-4 py-3 ${props.tone === "risk" ? "border-destructive/70" : props.tone === "tip" ? "border-primary/70" : "border-line-strong"}`}>
      <div className="label mb-1.5">{props.tone === "risk" ? "What to watch" : props.tone === "tip" ? "Worth knowing" : "Keep in mind"}</div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{props.text}</p>
    </aside>,
    Places: ({ props }) => <section data-tour="places" className="report-block">
      <h3 className="label mb-3">Places to visit</h3>
      <ul className="divide-y divide-line border-y border-line">{props.items.map((item, i) => <li key={i} className="py-2.5">
        <div className="flex items-baseline justify-between gap-3 text-[12px]"><PlaceLink link={item.link}>{item.label}</PlaceLink><span aria-hidden className="text-[10px] text-primary">↗</span></div>
        {item.note && <p className="mt-1.5 text-[11px] leading-relaxed text-dim">{item.note}</p>}
      </li>)}</ul>
    </section>,
    NextSteps: ({ props }) => <section className="report-block border-t border-line-strong pt-4">
      <h3 className="label mb-3">What to do next</h3>
      <ol className="space-y-3">{props.items.map((item, i) => <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-[12px] leading-relaxed"><span className="num text-primary">{i + 1}.</span><Prose source={item} /></li>)}</ol>
    </section>,
  },
});

export function toWebSpec(blocks: readonly unknown[], charts: ChartSpec[]): Spec {
  const spec: Spec = { root: "report", elements: { report: { type: "ReportRoot", props: {}, children: [] } } };
  blocks.forEach((value, i) => {
    const parsed = blockSchema.safeParse(value);
    if (!parsed.success) return;
    const block = parsed.data;
    if (block.type === "Chart" && !charts.some((c) => c.id === block.props.id)) return;
    const key = `block-${i}`;
    spec.elements[key] = { type: block.type, props: block.props, children: [] };
    spec.elements.report.children!.push(key);
  });
  return spec;
}

export function ReportBody({ blocks, charts, onLink }: { blocks: readonly unknown[]; charts: ChartSpec[]; onLink?: (link: MapLink) => void }) {
  const spec = useMemo(() => toWebSpec(blocks, charts), [blocks, charts]);
  const context = useMemo(() => ({ charts, onLink }), [charts, onLink]);
  return <ReportContext.Provider value={context}><JSONUIProvider registry={webRegistry}><Renderer spec={spec} registry={webRegistry} /></JSONUIProvider></ReportContext.Provider>;
}
