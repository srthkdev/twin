"use client";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/lib/markdown";
import type { MapLink, Report, ReportSection, VerdictTone } from "@/lib/agent/report-types";
import { Chart } from "./chart";

const sourceLabel = (tool: string) => ({
  find_twins: "twin", twins_anywhere: "twin", explain_match: "twin", taste_profile: "twin",
  local_scene: "qloo", scene: "qloo", compare_taste: "qloo", trend: "qloo", opportunity: "qloo", tour: "qloo",
  venue_supply: "overture", geocode: "osm", web_search: "web", read_page: "web", wiki: "wiki", chart: "chart",
}[tool] ?? "tool");

function exploreHref(reportId: string, link?: MapLink) {
  const params = new URLSearchParams({ view: "report", report: reportId });
  if (link) params.set("focus", link);
  return `/explore?${params.toString()}`;
}

export function ReportView({ id, onLink }: { id: string; onLink?: (link: MapLink) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError(false);
    fetch(`/api/reports/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("Report unavailable"); return r.json() as Promise<Report>; })
      .then(setReport).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [id]);
  useEffect(() => { if (report) reportRef.current?.scrollIntoView({ block: "start" }); }, [report]);
  if (error) return <p className="border-t border-line pt-4 text-[12px] text-destructive">Couldn’t load this report.</p>;
  if (!report) return <p className="border-t border-line pt-4 text-[11px] text-dim"><span className="cursor-block">loading report</span></p>;
  return <div ref={reportRef}><ReportDocument report={report} onLink={onLink} /></div>;
}

export function ReportDocument({ report, onLink }: { report: Report; onLink?: (link: MapLink) => void }) {
  const created = new Date(report.createdAt);
  const date = Number.isNaN(created.getTime()) ? "" : created.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
  const handleLink = (link: MapLink) => {
    if (onLink) onLink(link);
    else window.location.assign(exploreHref(report.id, link));
  };
  const tones: Record<VerdictTone, string> = {
    go: "border-primary/70 bg-primary/10 text-primary",
    watch: "border-primary/40 bg-primary/5 text-primary/90",
    skip: "border-destructive/60 bg-destructive/10 text-destructive",
    info: "border-line-strong bg-card text-muted-foreground",
  };
  return (
    <article className="report-document min-w-0 border-t border-line pt-5 text-foreground">
      <header className="border-b border-line pb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-dim">
          <span className="label">Twin report</span>{date && <><span>·</span><span className="num">{date}</span></>}
        </div>
        <h1 className="text-balance text-[clamp(22px,3vw,34px)] font-medium leading-tight tracking-[-0.04em]">{report.title}</h1>
        {report.subtitle && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{report.subtitle}</p>}
        {report.question && <p className="mt-4 border-l border-line-strong pl-3 text-[11px] leading-relaxed text-dim">{report.question}</p>}
      </header>

      {report.verdict && <div className={`my-5 border px-3 py-3 ${tones[report.verdict.tone]}`}>
        <div className="mb-1 label text-current">{report.verdict.label}</div>
        <p className="text-[12px] leading-relaxed">{report.verdict.line}</p>
      </div>}

      {!!report.kpis?.length && <div className="my-5 grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
        {report.kpis.slice(0, 4).map((k, i) => <div key={`${k.label}-${i}`} className="bg-background px-3 py-2.5">
          <div className="label">{k.label}</div><div className="num mt-1 text-[19px] text-foreground">{k.value}</div>
          {k.note && <div className="mt-1 text-[10.5px] leading-relaxed text-dim">{k.note}</div>}
        </div>)}
      </div>}

      <div className="space-y-6">
        {report.sections.map((section, i) => <Section key={`${section.heading}-${i}`} section={section} report={report} onLink={handleLink} />)}
      </div>

      {!!report.places?.length && <section className="mt-8 border-t border-line pt-4">
        <h2 className="label mb-3">Places to look at</h2>
        <ul className="divide-y divide-line border-y border-line">
          {report.places.map((place, i) => <li key={`${place.label}-${i}`} className="py-2.5">
            <button type="button" onClick={() => handleLink(place.link)} className="text-left text-[12px] text-foreground underline decoration-line-strong underline-offset-4 hover:text-primary hover:decoration-primary">{place.label}</button>
            {place.note && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{place.note}</p>}
          </li>)}
        </ul>
      </section>}

      <details className="group mt-8 border-t border-line py-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[10.5px] text-dim hover:text-muted-foreground [&::-webkit-details-marker]:hidden">
          <span className="transition-transform group-open:rotate-90">›</span><span>How this was made</span>
        </summary>
        <div className="mt-3 space-y-3 pl-4">
          <ul className="space-y-1.5">
            {report.evidence.map((e, i) => <li key={`${e.tool}-${i}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-[10.5px] leading-relaxed">
              <span><span className="uppercase tracking-wide text-primary">{sourceLabel(e.tool)}</span><span className="ml-1 text-[9px] text-dim">{e.tool.replace(/_/g, " ")}</span></span>
              <span className="text-muted-foreground">{e.summary}</span>
            </li>)}
          </ul>
          <p className="text-[10.5px] text-dim"><span className="num">{report.grounding.grounded} of {report.grounding.numbers}</span> numbers traced to tool results</p>
          {report.model && <p className="text-[10px] text-dim">model: {report.model}</p>}
        </div>
      </details>
    </article>
  );
}

function Section({ section, report, onLink }: { section: ReportSection; report: Report; onLink: (link: MapLink) => void }) {
  const parts = section.body.split(/(\[\[fig-[^\]]+\]\])/g);
  return <section className="report-section min-w-0">
    <h2 className="mb-2 text-[15px] font-medium tracking-[-0.02em]">{section.heading}</h2>
    {parts.map((part, i) => {
      const match = part.match(/^\[\[(fig-[^\]]+)\]\]$/);
      if (match) {
        const chart = report.charts.find((c) => c.id === match[1]);
        return chart ? <Chart key={i} spec={chart} onLink={onLink} /> : null;
      }
      return part.trim() ? <Markdown key={i} source={part} variant="article" onLink={onLink} /> : null;
    })}
  </section>;
}

export function SharedPlaces({ report }: { report: Report }) {
  return <aside className="share-places border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
    <h2 className="label mb-3">Places on the map</h2>
    {report.places?.length ? <ul className="divide-y divide-line border-y border-line">
      {report.places.map((p, i) => <li key={`${p.label}-${i}`} className="py-2">
        <a href={exploreHref(report.id, p.link)} className="text-[11px] text-foreground underline decoration-line-strong underline-offset-4 hover:text-primary">{p.label}</a>
        {p.note && <p className="mt-1 text-[10px] leading-relaxed text-dim">{p.note}</p>}
      </li>)}
    </ul> : <p className="text-[11px] text-dim">This report has no linked places.</p>}
    <a href={exploreHref(report.id)} className="mt-4 inline-block border border-line-strong px-2.5 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary hover:text-primary">open in Twin →</a>
  </aside>;
}
