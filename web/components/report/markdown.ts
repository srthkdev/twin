import type { ChartSpec, Report } from "@/lib/agent/report-types";
import { reportBlocks } from "@/lib/report/normalize";
import { chartValue } from "./format";

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const linked = (label: string, link?: string | null) => link ? `[${cell(label)}](${link})` : cell(label);
const table = (columns: string[], rows: string[][]) => [
  `| ${columns.map(cell).join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
].join("\n");

function chartMarkdown(chart: ChartSpec) {
  const data = chart.kind === "scatter" && chart.points?.length
    ? table(["Place", chart.axes?.x ?? "x", chart.axes?.y ?? "y"], chart.points.map((p) => [linked(p.label, p.link), chartValue(p.x, chart.unit), chartValue(p.y, chart.unit)]))
    : table(["Place", ...chart.series.map((s) => s.name)], chart.labels.map((label, i) => [linked(label, chart.links?.[i]), ...chart.series.map((s) => chartValue(s.values[i], chart.unit))]));
  return [`### ${chart.title}`, chart.caption, data, chart.sources.length ? `Source: ${chart.sources.map((s) => s.replace(/_/g, " ")).join(", ")}` : undefined].filter(Boolean).join("\n\n");
}

export function reportMarkdown(report: Report) {
  const embedded = new Set<string>();
  const body = reportBlocks(report).map((block) => {
    switch (block.type) {
      case "Verdict": return `**${block.props.label}:** ${block.props.line}`;
      case "KpiRow": return table(["Measure", "Value", "Note"], block.props.items.map((k) => [linked(k.label, k.link), k.value, k.note ?? ""]));
      case "Heading": return `## ${block.props.text}`;
      case "Paragraph": return block.props.markdown;
      case "Chart": {
        const chart = report.charts.find((c) => c.id === block.props.id);
        if (!chart) return "";
        embedded.add(chart.id);
        return [chartMarkdown(chart), block.props.note].filter(Boolean).join("\n\n");
      }
      case "Ranking": return `### ${block.props.title}\n\n${block.props.items.map((item, i) => `${i + 1}. ${linked(item.label, item.link)}${item.metric ? ` · ${item.metric}` : ""} — ${item.reason}`).join("\n")}`;
      case "Compare": return table(["Measure", linked(block.props.left.title, block.props.left.link), linked(block.props.right.title, block.props.right.link)], block.props.rows.map((r) => [r.measure, r.left, r.right]));
      case "Table": return [block.props.caption, table(block.props.columns, block.props.rows)].filter(Boolean).join("\n\n");
      case "Callout": return `> ${block.props.text}`;
      case "Places": return `## Places to visit\n\n${block.props.items.map((p) => `- ${linked(p.label, p.link)}${p.note ? ` — ${p.note}` : ""}`).join("\n")}`;
      case "NextSteps": return `## What to do next\n\n${block.props.items.map((item, i) => `${i + 1}. ${item}`).join("\n")}`;
    }
  });
  return [
    `# ${report.title}`, report.subtitle, report.createdAt ? `_Twin report · ${report.createdAt.slice(0, 10)}_` : undefined,
    report.question ? `> ${report.question}` : undefined, ...body,
    ...report.charts.filter((c) => !embedded.has(c.id)).map(chartMarkdown),
    "## How this was made", ...report.evidence.map((e) => `- ${e.tool.replace(/_/g, " ")}: ${e.summary}`),
    `${report.grounding.grounded} of ${report.grounding.numbers} numbers traced to tool results`,
    report.skill ? `Playbook: ${report.skill.replace(/-/g, " ")}` : undefined, report.model ? `Model: ${report.model}` : undefined,
  ].filter(Boolean).join("\n\n");
}

export function downloadMarkdown(report: Report) {
  const url = URL.createObjectURL(new Blob([reportMarkdown(report)], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "twin-report"}.md`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
