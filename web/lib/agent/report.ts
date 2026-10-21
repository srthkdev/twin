import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ChartSpec, Report, VerdictTone } from "./report-types";
import { storePut } from "./store";
import { ToolError, defineTool, type ToolContext } from "./tool-kit";

export interface EvidenceEntry { tool: string; summary: string; numbers: number[] }
export interface AgentRunContext {
  evidence: EvidenceEntry[];
  charts: Map<string, ChartSpec>;
  nextChartId: number;
  question?: string;
  model?: () => string | undefined;
}
type ReportToolContext = ToolContext & { run?: AgentRunContext };

const mapLink = z.string().regex(/^(?:hood:[A-Za-z0-9_-]+|geo:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)$/, "use hood:<id> or geo:<lat>,<lon>");

export const chartInputSchema = z.object({
  kind: z.enum(["bar", "hbar", "line", "scatter", "table"]),
  title: z.string().min(1),
  caption: z.string().optional(),
  unit: z.string().optional(),
  labels: z.array(z.string()).min(1).max(25),
  series: z.array(z.object({ name: z.string().min(1), values: z.array(z.number().finite()) }).strict()).min(1).max(3),
  points: z.array(z.object({ label: z.string(), x: z.number().finite(), y: z.number().finite(), link: mapLink.optional() }).strict()).optional(),
  axes: z.object({ x: z.string().optional(), y: z.string().optional() }).strict().optional(),
  links: z.array(mapLink.nullable()).optional(),
}).strict();

export type ChartInput = z.infer<typeof chartInputSchema>;

export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }
  return out;
}

function rounded(n: number, places: number) {
  const scale = 10 ** places;
  return Math.round(n * scale) / scale;
}

function matchesLedger(value: number, entries: EvidenceEntry[], percent: boolean) {
  const sources: string[] = [];
  for (const entry of entries) {
    if (entry.tool === "chart" || entry.tool === "report") continue;
    const match = entry.numbers.some((base) => {
      const variants = [base, ...[0, 1, 2, 3].map((p) => rounded(base, p))];
      if (percent) variants.push(base * 100, ...[0, 1, 2, 3].map((p) => rounded(base * 100, p)));
      return variants.some((candidate) => candidate === value || Math.abs(candidate - value) <= Math.abs(candidate) * 0.005 || (candidate === 0 && Math.abs(value) <= 1e-9));
    });
    if (match) sources.push(entry.tool);
  }
  return [...new Set(sources)];
}

export interface GroundingResult { numbers: number; grounded: number; bad: number[]; sources: string[] }

export function validateGrounding(values: { value: number; percent?: boolean }[], entries: EvidenceEntry[]): GroundingResult {
  const sources = new Set<string>(), bad: number[] = [];
  for (const item of values) {
    const matched = matchesLedger(item.value, entries, !!item.percent);
    if (!matched.length) bad.push(item.value);
    for (const source of matched) sources.add(source);
  }
  return { numbers: values.length, grounded: values.length - bad.length, bad, sources: [...sources] };
}

const chartValues = (input: Pick<ChartSpec, "series" | "points">) => [
  ...input.series.flatMap((series) => series.values),
  ...(input.points ?? []).flatMap((point) => [point.x, point.y]),
];

export function validateChart(input: unknown, entries: EvidenceEntry[]): { ok: true; sources: string[]; numbers: number } | { ok: false; error: string; bad: number[] } {
  const parsed = chartInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid chart: ${parsed.error.issues.map((i) => `${i.path.join(".") || "chart"} ${i.message}`).join("; ")}`, bad: [] };
  const chart = parsed.data;
  if (chart.series.some((series) => series.values.length !== chart.labels.length)) {
    return { ok: false, error: "Invalid chart: each series must have one value for every label.", bad: [] };
  }
  if (chart.links && chart.links.length !== chart.labels.length) {
    return { ok: false, error: "Invalid chart: links must have one entry for every label.", bad: [] };
  }
  if (chart.kind !== "scatter" && chart.points?.length) return { ok: false, error: "Invalid chart: points are only allowed for scatter charts.", bad: [] };
  const values = chartValues(chart).map((value) => ({ value, percent: chart.unit === "%" }));
  const grounding = validateGrounding(values, entries);
  if (grounding.bad.length) return { ok: false, error: ungroundedError(grounding.bad), bad: grounding.bad };
  return { ok: true, sources: grounding.sources, numbers: grounding.numbers };
}

function ungroundedError(values: number[]) {
  const shown = [...new Set(values)].map((value) => String(value)).join(", ");
  return `Ungrounded values: ${shown}. Call the relevant data tool first (for example find_twins, opportunity, venue_supply, tour, or trend), then retry.`;
}

const verdictSchema = z.object({ label: z.enum(["GO", "WATCH", "SKIP", "INFO"]), line: z.string().min(1) }).strict();
const kpiSchema = z.object({ label: z.string().min(1), value: z.string().min(1), note: z.string().optional() }).strict();
const inlineChartSchema = chartInputSchema;

export const reportInputSchema = z.object({
  title: z.string().min(3),
  subtitle: z.string().optional(),
  verdict: verdictSchema.optional(),
  kpis: z.array(kpiSchema).max(4).optional(),
  sections: z.array(z.object({ heading: z.string().min(1), body: z.string() }).strict()).min(3).max(6),
  chart_ids: z.array(z.string()).max(4).optional(),
  charts: z.array(inlineChartSchema).max(4).optional(),
  places: z.array(z.object({ label: z.string().min(1), link: mapLink, note: z.string().optional() }).strict()).optional(),
}).strict();

type ReportInput = z.infer<typeof reportInputSchema>;

function numericText(text: string) {
  const values: { value: number; percent: boolean }[] = [];
  const re = /(?<![\w.])[-+]?\d[\d,]*(?:\.\d+)?\s*(%)?/g;
  for (const match of text.matchAll(re)) {
    const value = Number(match[0].replace(/[%\s,]/g, ""));
    if (Number.isFinite(value)) values.push({ value, percent: !!match[1] });
  }
  return values;
}

function chartGroundingValues(chart: ChartSpec) {
  return chartValues(chart).map((value) => ({ value, percent: chart.unit === "%" }));
}

function cleanCell(text: string) { return text.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "); }
function linkedLabel(label: string, link?: string | null) { return link ? `[${cleanCell(label)}](${link})` : cleanCell(label); }

function chartMarkdown(chart: ChartSpec) {
  const rows = chart.kind === "scatter" && chart.points?.length
    ? [`| Place | ${cleanCell(chart.axes?.x ?? "x")} | ${cleanCell(chart.axes?.y ?? "y")} |`, "| --- | ---: | ---: |", ...chart.points.map((point) => `| ${linkedLabel(point.label, point.link)} | ${point.x} | ${point.y} |`)]
    : [`| ${["Label", ...chart.series.map((series) => cleanCell(series.name))].join(" | ")} |`, `| ${["---", ...chart.series.map(() => "---:")].join(" | ")} |`, ...chart.labels.map((label, i) => `| ${[linkedLabel(label, chart.links?.[i]), ...chart.series.map((series) => String(series.values[i]))].join(" | ")} |`)];
  return [`### ${chart.title}`, chart.caption, chart.unit ? `_Unit: ${chart.unit}_` : undefined, ...rows].filter(Boolean).join("\n\n");
}

export function reportMarkdown(report: Report) {
  const byId = new Map(report.charts.map((chart) => [chart.id, chart]));
  const embedded = new Set<string>();
  const sections = report.sections.map((section) => {
    const body = section.body.replace(/\[\[(fig-[A-Za-z0-9_-]+)\]\]/g, (marker, id: string) => {
      const chart = byId.get(id);
      if (!chart) return marker;
      embedded.add(id);
      return `\n\n${chartMarkdown(chart)}\n\n`;
    });
    return `## ${section.heading}\n\n${body.trim()}`;
  });
  const parts = [
    `# ${report.title}`,
    report.subtitle,
    `_Generated by Twin · ${report.createdAt.slice(0, 10)}_`,
    report.verdict ? `**${report.verdict.label}:** ${report.verdict.line}` : undefined,
    report.kpis?.length ? `| Measure | Value | Note |\n| --- | --- | --- |\n${report.kpis.map((kpi) => `| ${cleanCell(kpi.label)} | ${cleanCell(kpi.value)} | ${cleanCell(kpi.note ?? "")} |`).join("\n")}` : undefined,
    ...sections,
    report.places?.length ? `## Places\n\n${report.places.map((place) => `- [${cleanCell(place.label)}](${place.link})${place.note ? ` — ${cleanCell(place.note)}` : ""}`).join("\n")}` : undefined,
    ...report.charts.filter((chart) => !embedded.has(chart.id)).map(chartMarkdown),
    report.evidence.length ? `## Evidence\n\n${report.evidence.map((item) => `- ${cleanCell(item.tool)}: ${cleanCell(item.summary)}`).join("\n")}` : undefined,
  ];
  return parts.filter(Boolean).join("\n\n");
}

function slug(text: string) { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function assignChart(input: ChartInput, run: AgentRunContext, checked?: { sources: string[] }) {
  const id = `fig-${run.nextChartId++}`;
  const chart: ChartSpec = { ...input, id, sources: checked?.sources ?? [] };
  run.charts.set(id, chart);
  return chart;
}

const chartTool = defineTool({
  name: "chart",
  description: "Build a chart from numbers in earlier tool results in this run. Every plotted number must match tool evidence; chart IDs are assigned by Twin and may be included in a report.",
  schema: chartInputSchema,
  async run(input, ctx) {
    const run = (ctx as ReportToolContext).run;
    if (!run) throw new ToolError("Chart creation needs an active agent run. Retry in the current conversation.");
    const checked = validateChart(input, run.evidence);
    if (!checked.ok) throw new ToolError(checked.error);
    const chart = assignChart(input, run, checked);
    return { data: chart, summary: `${chart.title} ready (${chart.id})` };
  },
});

export function validateReportGrounding(input: Pick<ReportInput, "kpis">, charts: ChartSpec[], entries: EvidenceEntry[]) {
  const values = [
    ...(input.kpis ?? []).flatMap((kpi) => [...numericText(kpi.label), ...numericText(kpi.value), ...numericText(kpi.note ?? "")]),
    ...charts.flatMap(chartGroundingValues),
  ];
  return validateGrounding(values, entries);
}

const reportTool = defineTool({
  name: "report",
  description: "Create a shareable Twin report with a verdict, grounded KPIs, short sections, charts from earlier chart calls or inline charts, and map-linked places. Also downloads a markdown copy.",
  schema: reportInputSchema,
  async run(input, ctx) {
    const run = (ctx as ReportToolContext).run;
    if (!run) throw new ToolError("Report creation needs an active agent run. Retry in the current conversation.");
    const selected = (input.chart_ids ?? []).map((id) => {
      const chart = run.charts.get(id);
      if (!chart) throw new ToolError(`Unknown chart ${id}. Use a chart ID returned earlier in this run.`);
      return chart;
    });
    if (new Set(input.chart_ids ?? []).size !== (input.chart_ids ?? []).length) throw new ToolError("Each chart ID can only be included once.");
    if (selected.length + (input.charts?.length ?? 0) > 4) throw new ToolError("A report can include at most 4 charts.");

    const charts = [...selected];
    for (const chartInput of input.charts ?? []) {
      const checked = validateChart(chartInput, run.evidence);
      if (!checked.ok) throw new ToolError(checked.error);
      charts.push(assignChart(chartInput, run, checked));
    }
    const includedIds = new Set(charts.map((chart) => chart.id));
    for (const section of input.sections) {
      for (const [, id] of section.body.matchAll(/\[\[(fig-[A-Za-z0-9_-]+)\]\]/g)) {
        if (!includedIds.has(id)) throw new ToolError(`Section references ${id}, but that chart is not included. Add its chart ID to the report.`);
      }
    }

    const grounding = validateReportGrounding(input, charts, run.evidence);
    if (grounding.bad.length) throw new ToolError(ungroundedError(grounding.bad));

    const id = randomBytes(6).toString("base64url");
    const verdictTone = input.verdict?.label.toLowerCase() as VerdictTone | undefined;
    const report: Report = {
      id,
      title: input.title,
      subtitle: input.subtitle,
      createdAt: new Date().toISOString(),
      question: run.question,
      verdict: input.verdict ? { ...input.verdict, tone: verdictTone! } : undefined,
      kpis: input.kpis,
      sections: input.sections,
      charts,
      places: input.places,
      evidence: run.evidence.map(({ tool, summary }) => ({ tool, summary })),
      grounding: { numbers: grounding.numbers, grounded: grounding.grounded },
      model: run.model?.(),
    };
    const markdown = reportMarkdown(report);
    const filename = `${slug(report.title) || "twin-report"}.md`;
    await storePut(`reports/${id}.json`, report);
    return {
      data: { id, url: `/r/${id}`, title: report.title, grounding: report.grounding },
      summary: `report ready: ${report.title}`,
      uiActions: [{ type: "report", id, title: report.title }, { type: "download", filename, markdown }],
    };
  },
});

export const REPORT_TOOLS = [chartTool, reportTool];
