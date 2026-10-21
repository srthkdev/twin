import type { Report } from "../agent/report-types";
import type { ReportBlock } from "./catalog";

export function evidenceSummary(tool: string, summary: string) {
  const match = (_: string, value: string) => `${Math.round(Number(value) * 100)}% match`;
  if (tool === "explain_match") return summary.replace(/\bcosine\s+(-?\d+(?:\.\d+)?)/gi, match);
  if (tool === "find_twins") return summary.replace(/\((-?\d+(?:\.\d+)?)\)/g, (_, value: string) => `(${Math.round(Number(value) * 100)}% match)`);
  if (tool === "twins_anywhere") return summary.replace(/(-?\d+(?:\.\d+)?)(?=\s*(?:\[qloo|$))/, match);
  return summary;
}

export function reportBlocks(report: Report): ReportBlock[] {
  if (report.blocks) return report.blocks;
  const blocks: ReportBlock[] = [];
  const embedded = new Set<string>();
  const verdict = report.verdict;
  const label = (verdict?.label ?? verdict?.tone)?.toUpperCase();
  blocks.push({ type: "Verdict", props: { label: label === "GO" || label === "WATCH" || label === "SKIP" ? label : "INFO", line: verdict?.line || report.subtitle || report.title } });
  for (let i = 0; i < (report.kpis?.length ?? 0); i += 4) blocks.push({ type: "KpiRow", props: { items: report.kpis!.slice(i, i + 4) } });
  for (const section of report.sections ?? []) {
    blocks.push({ type: "Heading", props: { text: section.heading } });
    for (const part of section.body.split(/\[\[(fig-\d+)\]\]/g)) {
      if (/^fig-\d+$/.test(part) && report.charts.some((chart) => chart.id === part)) {
        blocks.push({ type: "Chart", props: { id: part } });
        embedded.add(part);
      } else if (part.trim()) blocks.push({ type: "Paragraph", props: { markdown: part.trim() } });
    }
  }
  for (const chart of report.charts) if (!embedded.has(chart.id)) blocks.push({ type: "Chart", props: { id: chart.id } });
  for (let i = 0; i < (report.places?.length ?? 0); i += 12) blocks.push({ type: "Places", props: { items: report.places!.slice(i, i + 12) } });
  return blocks;
}
