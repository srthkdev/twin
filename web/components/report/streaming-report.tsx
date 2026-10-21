"use client";
import type { ChartSpec, MapLink } from "@/lib/agent/report-types";
import { ReportBody } from "@/lib/report/web";
import { Chart, streamingChart } from "@/components/agent/chart";

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export function streamingBlocks(input: Record<string, unknown>): unknown[] {
  if (Array.isArray(input.blocks)) return input.blocks;
  const blocks: unknown[] = [];
  if (record(input.verdict)) blocks.push({ type: "Verdict", props: input.verdict });
  if (Array.isArray(input.kpis) && input.kpis.length) blocks.push({ type: "KpiRow", props: { items: input.kpis } });
  if (Array.isArray(input.sections)) for (const section of input.sections) {
    if (!record(section)) continue;
    if (typeof section.heading === "string") blocks.push({ type: "Heading", props: { text: section.heading } });
    if (typeof section.body !== "string") continue;
    for (const part of section.body.split(/(\[\[fig-\d+\]\])/g)) {
      const chart = part.match(/^\[\[(fig-\d+)\]\]$/);
      if (chart) blocks.push({ type: "Chart", props: { id: chart[1] } });
      else if (part.trim()) blocks.push({ type: "Paragraph", props: { markdown: part } });
    }
  }
  if (Array.isArray(input.places) && input.places.length) blocks.push({ type: "Places", props: { items: input.places } });
  return blocks;
}

export function StreamingReport({ input, charts, onLink }: { input: unknown; charts: ChartSpec[]; onLink?: (link: MapLink) => void }) {
  const d = record(input) ? input : {};
  const next = Math.max(0, ...charts.map((c) => Number(c.id.replace(/^fig-/, ""))).filter(Number.isFinite)) + 1;
  const inline = Array.isArray(d.charts) ? d.charts.flatMap((c, i) => {
    const chart = streamingChart(c, `fig-${next + i}`);
    return chart ? [chart] : [];
  }) : [];
  const blocks = streamingBlocks(d);
  const available = [...charts, ...inline];
  return <section className="report-stream my-3 min-w-0 border-t border-line pt-4" aria-busy="true" aria-label="Report in progress">
    <div role="status" className="mb-4 flex items-center gap-2 text-[10.5px] text-dim"><span aria-hidden className="size-1 bg-primary motion-safe:animate-pulse" />writing report…{typeof d.skill === "string" && <span className="ml-auto">{d.skill.replace(/[-_]/g, " ")} playbook</span>}</div>
    {typeof d.title === "string" && <h2 className="mb-3 text-balance text-[22px] font-medium leading-tight tracking-[-0.04em]">{d.title}</h2>}
    {typeof d.subtitle === "string" && <p className="mb-5 text-[12px] leading-relaxed text-muted-foreground">{d.subtitle}</p>}
    <ReportBody blocks={blocks} charts={available} onLink={onLink} />
    {!!inline.length && !Array.isArray(d.blocks) && <div className="mt-4">{inline.map((spec) => <Chart key={spec.id} spec={spec} onLink={onLink} />)}</div>}
  </section>;
}
