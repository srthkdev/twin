"use client";
import { useMemo } from "react";
import { useJson } from "@/hooks/use-json";
import type { MapLink, Report } from "@/lib/agent/report-types";
import { reportBlocks } from "@/lib/report/normalize";
import { ReportBody } from "@/lib/report/web";
import { ShareActions } from "@/components/report/share-actions";
import { BaselinePanel } from "@/components/report/baseline-panel";

const sourceLabel = (tool: string) => ({
  find_twins: "Twin", twins_anywhere: "Twin", explain_match: "Twin", taste_profile: "Twin",
  local_scene: "Qloo", scene: "Qloo", compare_taste: "Qloo", trend: "Qloo", opportunity: "Qloo", tour: "Qloo",
  audience: "Qloo", cross_domain: "Qloo", add_city: "Qloo", venue_supply: "Overture", geocode: "OpenStreetMap",
  web_search: "Web", read_page: "Web", wiki: "Wikipedia", chart: "Chart", report_skill: "Playbook",
}[tool] ?? "Twin");

function exploreHref(reportId: string, link?: MapLink) {
  const params = new URLSearchParams({ view: "report", report: reportId });
  if (link) params.set("focus", link);
  return `/explore?${params.toString()}`;
}

/** Numbered map pins for a report: its ranked shortlist, or its linked places when it has none. Six at most. */
export function reportPins(report: Report): { label: string; link: MapLink }[] {
  const ranked: { label: string; link: MapLink }[] = [];
  for (const b of reportBlocks(report)) if (b.type === "Ranking") for (const p of b.props.items) if (p.link) ranked.push({ label: p.label, link: p.link });
  const list = ranked.length >= 2 ? ranked : [...ranked, ...reportPlaces(report)];
  return [...new Map(list.map((p) => [p.link, { label: p.label, link: p.link }])).values()].slice(0, 6);
}

export function ReportView({ id, onLink }: { id: string; onLink?: (link: MapLink) => void }) {
  const { data: report, error, mutate, isValidating } = useJson<Report>(`/api/reports/${encodeURIComponent(id)}`);
  if (error && !isValidating) return <div className="flex items-center justify-between gap-3 border-t border-line pt-4 text-[12px] text-destructive"><span>Couldn’t load this report.</span><button type="button" onClick={() => void mutate()} className="border border-line-strong px-2 py-1 text-muted-foreground hover:text-foreground">Retry</button></div>;
  if (!report) return <p role="status" className="border-t border-line pt-4 text-[11px] text-dim"><span className="cursor-block">loading report</span></p>;
  // scrolls the chat to the report once, when it first renders
  return <div ref={(el) => el?.scrollIntoView({ block: "start" })}><ReportDocument report={report} onLink={onLink} /></div>;
}

export function ReportDocument({ report, onLink }: { report: Report; onLink?: (link: MapLink) => void }) {
  const blocks = useMemo(() => reportBlocks(report), [report]);
  const created = new Date(report.createdAt);
  const date = Number.isNaN(created.getTime()) ? "" : created.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const skill = report.skill?.replace(/[-_]/g, " ");
  const handleLink = (link: MapLink) => {
    if (onLink) onLink(link);
    else window.location.assign(exploreHref(report.id, link));
  };
  return <article className="report-document min-w-0 border-t border-line pt-5 text-foreground">
    <header className="mb-6 border-b border-line pb-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-dim">
        <span className="label">Twin / field report</span>{date && <><span>·</span><time className="num" dateTime={report.createdAt}>{date}</time></>}
        {skill && <><span>·</span><span>{skill} playbook</span></>}
      </div>
      <h1 className="text-balance text-[clamp(24px,3vw,38px)] font-medium leading-[1.15] tracking-[-0.045em]">{report.title}</h1>
      {report.subtitle && <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{report.subtitle}</p>}
      {report.question && <div className="mt-4 border-l border-line-strong pl-3"><div className="label mb-1">The question</div><p className="text-[11.5px] leading-relaxed text-dim">{report.question}</p></div>}
      <dl className="mt-4 grid grid-cols-2 gap-px border border-line bg-line text-[11px] sm:grid-cols-4">
        {[
          ["Sources", [...new Set(report.evidence.map((e) => sourceLabel(e.tool)).filter((s) => !/report|chart|playbook/i.test(s)))].join(" · ")],
          ["Tool calls", String(report.evidence.filter((e) => !/^(chart|report|report_skill)$/.test(e.tool)).length)],
          ["Numbers traced", `${report.grounding.grounded} of ${report.grounding.numbers}`],
          ["Model", (report.model ?? "—").split("/").pop()!.replace(/:free$/, "")],
        ].map(([k, v]) => <div key={k} className="bg-background px-2.5 py-2"><dt className="label text-[9.5px]">{k}</dt><dd className="mt-0.5 truncate text-muted-foreground" title={v}>{v}</dd></div>)}
      </dl>
      <div className="mt-5"><ShareActions id={report.id} report={report} /></div>
    </header>
    <ReportBody blocks={blocks} charts={report.charts} onLink={handleLink} />
    {report.question && <div data-tour="baseline" className="mt-8"><BaselinePanel question={report.question} reportId={report.id} reportPlaces={reportPlaces(report)} /></div>}
    <details data-tour="evidence" className="report-method group mt-8 border-t border-line py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] text-dim hover:text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90">›</span><span>How this was made</span>
      </summary>
      <div className="mt-4 space-y-4 pl-4">
        <ol className="divide-y divide-line">
          {report.evidence.map((e, i) => <li key={`${e.tool}-${i}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-2 text-[10.5px] leading-relaxed">
            <div><div className="uppercase tracking-wide text-primary">{sourceLabel(e.tool)}</div><div className="mt-0.5 break-words text-[9px] text-dim">{e.tool.replace(/_/g, " ")}</div></div>
            <p className="text-muted-foreground">{e.summary}</p>
          </li>)}
        </ol>
        <p className="text-[10.5px] text-muted-foreground"><span className="num text-primary">{report.grounding.grounded} of {report.grounding.numbers}</span> numbers traced to tool results</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-dim">
          {report.model && <p>Model: {report.model}</p>}{skill && <p>Playbook: {skill}</p>}
        </div>
      </div>
    </details>
  </article>;
}

/** Every map-linked place in a report (places, rankings, compares, chart links), deduplicated by link. */
export function reportPlaces(report: Report): { label: string; link: MapLink; note?: string }[] {
    const linked: { label: string; link: MapLink; note?: string }[] = [...(report.places ?? [])];
  for (const block of reportBlocks(report)) {
    if (block.type === "Places") linked.push(...block.props.items);
    if (block.type === "Ranking") block.props.items.forEach((p) => { if (p.link) linked.push({ label: p.label, link: p.link, note: p.reason }); });
    if (block.type === "Compare") [block.props.left, block.props.right].forEach((p) => { if (p.link) linked.push({ label: p.title, link: p.link }); });
  }
  report.charts.forEach((chart) => {
    chart.links?.forEach((link, i) => { if (link && chart.labels[i]) linked.push({ label: chart.labels[i], link }); });
    chart.points?.forEach((p) => { if (p.link) linked.push({ label: p.label, link: p.link }); });
  });
  return [...new Map(linked.map((p) => [p.link, p])).values()];
}

export function SharedPlaces({ report }: { report: Report }) {
  const places = useMemo(() => reportPlaces(report), [report]);
  return <aside className="share-places self-start border-t border-line pt-4 lg:sticky lg:top-16 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
    <h2 className="label mb-3">Places on the map</h2>
    {places.length ? <ul className="divide-y divide-line border-y border-line">
      {places.map((p) => <li key={p.link} className="py-2.5">
        <a href={exploreHref(report.id, p.link)} className="text-[11px] text-foreground underline decoration-line-strong underline-offset-4 hover:text-primary">{p.label}</a>
        {p.note && <p className="mt-1 text-[10px] leading-relaxed text-dim">{p.note}</p>}
      </li>)}
    </ul> : <p className="text-[11px] text-dim">This report has no linked places.</p>}
    <a href={exploreHref(report.id)} className="print-hidden mt-4 inline-block border border-line-strong px-2.5 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary hover:text-primary">Open in Twin →</a>
  </aside>;
}
