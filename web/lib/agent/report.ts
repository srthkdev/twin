import { randomBytes } from "node:crypto";
import { z } from "zod";
import { blockSchema, catalogPrompt, mapLink, type ReportBlock } from "../report/catalog";
import { evidenceSummary, reportBlocks } from "../report/normalize";
import type { ChartSpec, Report, VerdictTone } from "./report-types";
import { storePut } from "./store";
import { appendReport } from "../user-store";
import { ToolError, defineTool, type ToolContext } from "./tool-kit";

export interface EvidenceEntry { tool: string; summary: string; numbers: number[] }
export interface AgentRunContext {
  user?: { name: string; code: string };
  evidence: EvidenceEntry[];
  charts: Map<string, ChartSpec>;
  nextChartId: number;
  question?: string;
  model?: () => string | undefined;
  reportMode?: boolean;
  skill?: string;
  /** set once a report is saved */
  reportId?: string;
}
type ReportToolContext = ToolContext & { run?: AgentRunContext };

export const chartInputSchema = z.object({
  kind: z.enum(["bar", "hbar", "line", "scatter", "table"]),
  title: z.string().min(1),
  caption: z.string().optional(),
  unit: z.string().optional(),
  // scatter charts use points; every other kind needs labels and 1–3 series (checked in validateChart)
  labels: z.array(z.string()).max(25).default([]),
  series: z.array(z.object({ name: z.string().min(1), values: z.array(z.number().finite()) }).strict()).max(3).default([]),
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

const SKIP = new Set(["chart", "report", "report_skill"]);
interface LedgerIndex { size: number; plain: { v: Float64Array; tool: string[] }; pct: { v: Float64Array; tool: string[] } }
const indexes = new WeakMap<EvidenceEntry[], LedgerIndex>();

/** Every evidence number, sorted (and ×100 for percentages), rebuilt only when the ledger grows. Tool results can
 *  carry tens of thousands of numbers (every map cell), so matching must be a binary search, not a scan. */
function ledgerIndex(entries: EvidenceEntry[]): LedgerIndex {
  const hit = indexes.get(entries);
  if (hit && hit.size === entries.length) return hit;
  const build = (scale: number) => {
    const rows: [number, string][] = [];
    for (const e of entries) if (!SKIP.has(e.tool)) for (const n of e.numbers) rows.push([n * scale, e.tool]);
    rows.sort((a, b) => a[0] - b[0]);
    return { v: Float64Array.from(rows, (r) => r[0]), tool: rows.map((r) => r[1]) };
  };
  const idx = { size: entries.length, plain: build(1), pct: build(100) };
  indexes.set(entries, idx);
  return idx;
}

/** Same rule as before: the value equals the base, or the base rounded to 0–3 dp, within 0.5% relative. */
function matchesBase(base: number, value: number) {
  return [base, ...[0, 1, 2, 3].map((p) => rounded(base, p))]
    .some((c) => c === value || Math.abs(c - value) <= Math.abs(c) * 0.005 || (c === 0 && Math.abs(value) <= 1e-9));
}

function searchSorted(v: Float64Array, x: number) {
  let lo = 0, hi = v.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (v[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

function matchesLedger(value: number, entries: EvidenceEntry[], percent: boolean) {
  const idx = ledgerIndex(entries), sources = new Set<string>();
  // any matching base lies within ±0.5 (rounding to 0 dp) plus the relative tolerance of the value
  const pad = 0.5 + Math.abs(value) * 0.006 + 1e-9;
  for (const side of percent ? [idx.plain, idx.pct] : [idx.plain]) {
    for (let i = searchSorted(side.v, value - pad); i < side.v.length && side.v[i] <= value + pad; i++) {
      if (matchesBase(side.v[i], value)) sources.add(side.tool[i]);
    }
  }
  return [...sources];
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
  if (chart.kind === "scatter" ? !chart.points?.length : !chart.labels.length || !chart.series.length) {
    return { ok: false, error: chart.kind === "scatter" ? "Invalid chart: a scatter needs points [{label, x, y}]." : "Invalid chart: give labels and 1–3 series.", bad: [] };
  }
  if (chart.series.some((series) => series.values.length !== chart.labels.length)) {
    return { ok: false, error: "Invalid chart: each series must have one value for every label.", bad: [] };
  }
  if (chart.links && chart.links.length !== chart.labels.length) {
    return { ok: false, error: "Invalid chart: links must have one entry for every label.", bad: [] };
  }
  if (chart.kind !== "scatter" && chart.points?.length) return { ok: false, error: "Invalid chart: points are only allowed for scatter charts.", bad: [] };
  if (chart.kind === "scatter" && !chart.points?.length) return { ok: false, error: "Invalid chart: scatter needs at least one point.", bad: [] };
  const values = chartValues(chart).map((value) => ({ value, percent: isPercentUnit(chart.unit) }));
  const grounding = validateGrounding(values, entries);
  if (grounding.bad.length) return { ok: false, error: ungroundedError(grounding.bad), bad: grounding.bad };
  return { ok: true, sources: grounding.sources, numbers: grounding.numbers };
}

function ungroundedError(values: number[]) {
  const shown = [...new Set(values)].map((value) => String(value)).join(", ");
  return `Ungrounded values: ${shown}. Call the relevant data tool first (for example find_twins, opportunity, venue_supply, tour, or trend), then retry.`;
}

export const reportInputSchema = z.object({
  title: z.string().min(3),
  subtitle: z.string().optional(),
  skill: z.string().optional(),
  blocks: z.array(blockSchema).min(5).max(36),
}).strict();

type ReportInput = z.infer<typeof reportInputSchema>;

const isPercentUnit = (unit?: string) => /%|percent|match/i.test(unit ?? "");

export function numericText(text: string) {
  const values: { value: number; percent: boolean }[] = [];
  const visible = text.replace(/\]\((?:[^()\n]|\([^()]*\))*\)/g, "]")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
    .replace(/<(?:https?:\/\/|hood:|geo:)[^>]*>/g, "")
    // not measurements: clock times, ordinals and decades, age bands, and numbers that are part of a name or address
    .replace(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b\d{1,2}:\d{2}\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th|s)\b/gi, "")
    .replace(/\b\d{1,3}\s*(?:to|-|–|—)\s*\d{1,3}\b(?!\s*%)/g, "")
    .replace(/\b\d+\s+(?=[A-Z][a-z])(?!(?:Venues?|Bars?|Caf|Cells?|Blocks?|Places?|Fans?)\b)/g, "");
  const re = /(?<![\w.])[-+]?\d[\d,]*(?:\.\d+)?\s*(%)?/g;
  for (const match of visible.matchAll(re)) {
    const value = Number(match[0].replace(/[%\s,]/g, ""));
    if (!match[1] && Number.isInteger(value) && value >= 1900 && value <= 2100) continue;
    if (Number.isFinite(value)) values.push({ value, percent: !!match[1] });
  }
  return values;
}

function chartGroundingValues(chart: ChartSpec) {
  return chartValues(chart).map((value) => ({ value, percent: isPercentUnit(chart.unit) }));
}

function cleanCell(text: string) { return text.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "); }
function linkedLabel(label: string, link?: string | null) { return link ? `[${cleanCell(label)}](${link})` : cleanCell(label); }

function chartMarkdown(chart: ChartSpec) {
  const rows = chart.kind === "scatter" && chart.points?.length
    ? [`| Place | ${cleanCell(chart.axes?.x ?? "x")} | ${cleanCell(chart.axes?.y ?? "y")} |`, "| --- | ---: | ---: |", ...chart.points.map((point) => `| ${linkedLabel(point.label, point.link)} | ${point.x} | ${point.y} |`)]
    : [`| ${["Label", ...chart.series.map((series) => cleanCell(series.name))].join(" | ")} |`, `| ${["---", ...chart.series.map(() => "---:")].join(" | ")} |`, ...chart.labels.map((label, i) => `| ${[linkedLabel(label, chart.links?.[i]), ...chart.series.map((series) => String(series.values[i]))].join(" | ")} |`)];
  return [`### ${chart.title}`, chart.caption, chart.unit ? `_Unit: ${chart.unit}_` : undefined, rows.join("\n")].filter(Boolean).join("\n\n");
}

export function reportMarkdown(report: Report) {
  const byId = new Map(report.charts.map((chart) => [chart.id, chart]));
  const table = (columns: string[], rows: string[][]) => [`| ${columns.map(cleanCell).join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(cleanCell).join(" | ")} |`)].join("\n");
  const blocks = reportBlocks(report).map((block) => {
    switch (block.type) {
      case "Verdict": return `**${block.props.label}:** ${block.props.line}`;
      case "KpiRow": return table(["Measure", "Value", "Note"], block.props.items.map((item) => [linkedLabel(item.label, item.link), item.value, item.note ?? ""]));
      case "Heading": return `## ${block.props.text}`;
      case "Paragraph": return block.props.markdown;
      case "Chart": { const chart = byId.get(block.props.id); return chart ? [chartMarkdown(chart), block.props.note].filter(Boolean).join("\n\n") : `Chart unavailable: ${block.props.id}`; }
      case "Ranking": return `### ${block.props.title}\n\n${block.props.items.map((item, i) => `${i + 1}. ${linkedLabel(item.label, item.link)}${item.metric ? ` · ${item.metric}` : ""} — ${item.reason}`).join("\n")}`;
      case "Compare": return table(["Measure", linkedLabel(block.props.left.title, block.props.left.link), linkedLabel(block.props.right.title, block.props.right.link)], block.props.rows.map((row) => [row.measure, row.left, row.right]));
      case "Table": return [table(block.props.columns, block.props.rows), block.props.caption].filter(Boolean).join("\n\n");
      case "Callout": return `> ${block.props.tone.toUpperCase()}: ${block.props.text}`;
      case "Places": return `### Places\n\n${block.props.items.map((item) => `- ${linkedLabel(item.label, item.link)}${item.note ? ` — ${item.note}` : ""}`).join("\n")}`;
      case "NextSteps": return `### Next steps\n\n${block.props.items.map((item, i) => `${i + 1}. ${item}`).join("\n")}`;
    }
  });
  const parts = [
    `# ${report.title}`,
    report.subtitle,
    `_Generated by Twin · ${report.createdAt.slice(0, 10)}_`,
    ...blocks,
    report.evidence.length ? `## Evidence\n\n${report.evidence.map((item) => `- ${cleanCell(item.tool)}: ${cleanCell(evidenceSummary(item.tool, item.summary))}`).join("\n")}` : undefined,
    `${report.grounding.grounded} of ${report.grounding.numbers} checked numbers matched tool evidence.`,
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

function blockText(block: ReportBlock): [string, string][] {
  switch (block.type) {
    case "Verdict": return [["line", block.props.line]];
    case "Paragraph": return [["markdown", block.props.markdown]];
    case "Callout": return [["text", block.props.text]];
    case "KpiRow": return block.props.items.flatMap((item, i) => Object.entries(item).filter(([key]) => key !== "link").map(([key, value]) => [`items.${i}.${key}`, value] as [string, string]));
    case "Ranking": return [["title", block.props.title], ...block.props.items.flatMap((item, i) => Object.entries(item).filter(([key]) => key !== "link").map(([key, value]) => [`items.${i}.${key}`, value] as [string, string]))];
    case "Compare": return block.props.rows.flatMap((row, i) => [[`rows.${i}.left`, row.left], [`rows.${i}.right`, row.right]] as [string, string][]);
    case "Table": return block.props.rows.flatMap((row, i) => row.map((value, j) => [`rows.${i}.${j}`, value] as [string, string]));
    default: return [];
  }
}

export function validateReportGrounding(input: Pick<ReportInput, "blocks">, charts: ChartSpec[], entries: EvidenceEntry[]) {
  return validateGrounding([
    ...input.blocks.flatMap((block) => blockText(block).flatMap(([, value]) => numericText(value))),
    ...charts.flatMap(chartGroundingValues),
  ], entries);
}

export function validateReport(input: unknown, run: Pick<AgentRunContext, "charts" | "evidence">) {
  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) throw new ToolError(`Invalid report: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "report"}: ${issue.message}`).join("; ")}`);
  const report = parsed.data;
  if (report.blocks[0].type !== "Verdict") throw new ToolError(`Block 1 (${report.blocks[0].type}): first block must be Verdict.`);
  const charts: ChartSpec[] = [];
  for (const [i, block] of report.blocks.entries()) {
    const location = `Block ${i + 1} (${block.type})`;
    if (i > 0 && block.type === "Verdict") throw new ToolError(`${location}: only the first block may be Verdict.`);
    if (block.type === "Chart") {
      if (charts.length >= 6) throw new ToolError(`${location}: ${block.props.id} exceeds the limit of 6 Chart blocks.`);
      const chart = run.charts.get(block.props.id);
      if (!chart) throw new ToolError(`${location}: unknown chart ${block.props.id}. Use an id returned by chart in this run.`);
      const checked = validateGrounding(chartGroundingValues(chart), run.evidence);
      if (checked.bad.length) throw new ToolError(`${location} (${chart.id}): ${ungroundedError(checked.bad)}`);
      charts.push(chart);
    }
    // Headline numbers must trace to tool results; numbers in prose are counted (and shown) but don't block the report.
    for (const [field, text] of blockText(block)) {
      if (block.type !== "KpiRow" || !/\.value$/.test(field)) continue;
      // small whole numbers ("6 of 6", "3 sites") are counts of listed things, not measurements
      const checked = validateGrounding(numericText(text).filter((n) => n.percent || !Number.isInteger(n.value) || n.value > 12), run.evidence);
      if (checked.bad.length) throw new ToolError(`${location} props.${field} ${JSON.stringify(text)}: ${ungroundedError(checked.bad)}`);
    }
  }
  return { input: report, charts: [...new Map(charts.map((chart) => [chart.id, chart])).values()], grounding: validateReportGrounding(report, charts, run.evidence) };
}

export function reportPlaces(blocks: ReportBlock[]): NonNullable<Report["places"]> {
  const places = new Map<string, NonNullable<Report["places"]>[number]>();
  const add = (label: string, link: string, note?: string) => {
    if (mapLink.safeParse(link).success && !places.has(link)) places.set(link, { label, link, ...(note ? { note } : {}) });
  };
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const [, label, link] of value.matchAll(/\[([^\]]+)\]\((hood:[A-Za-z0-9_-]+|geo:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)\)/g)) add(label, link);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const item = value as Record<string, unknown>;
      if (typeof item.link === "string") add(String(item.label ?? item.title ?? "Place"), item.link, typeof item.note === "string" ? item.note : undefined);
      Object.values(item).forEach(visit);
    }
  };
  visit(blocks);
  return [...places.values()];
}

/** Each fact once: one KpiRow (unique labels), each chart once, and venues already in the Shortlist left out of Places. */
export function tidyBlocks(blocks: ReportBlock[]): ReportBlock[] {
  const ranked = new Set(blocks.flatMap((b) => (b.type === "Ranking" ? b.props.items.map((i) => i.link ?? i.label.toLowerCase()) : [])));
  const charts = new Set<string>();
  let kpiSeen = false;
  return blocks.flatMap((b): ReportBlock[] => {
    if (b.type === "Chart") { if (charts.has(b.props.id)) return []; charts.add(b.props.id); return [b]; }
    if (b.type === "KpiRow") {
      if (kpiSeen) return [];
      kpiSeen = true;
      const items = [...new Map(b.props.items.map((i) => [i.label.trim().toLowerCase(), i])).values()];
      return [{ ...b, props: { ...b.props, items } }];
    }
    if (b.type === "Places") {
      const items = b.props.items.filter((i) => !ranked.has(i.link) && !ranked.has(i.label.toLowerCase()));
      return items.length ? [{ ...b, props: { ...b.props, items } }] : [];
    }
    return [b];
  });
}

const reportTool = defineTool({
  name: "report",
  description: `Create a shareable Twin report after report_skill and evidence gathering. Supply 12–36 catalog blocks, Verdict first, at most 6 Chart blocks referencing chart ids from this run. Every number in narrative and headline values must match tool evidence. Also downloads markdown.\n${catalogPrompt()}`,
  schema: reportInputSchema,
  async run(input, ctx) {
    const run = (ctx as ReportToolContext).run;
    if (!run) throw new ToolError("Report creation needs an active agent run. Retry in the current conversation.");
    const { charts, grounding } = validateReport(input, run);
    input = { ...input, blocks: tidyBlocks(input.blocks) };
    const verdict = input.blocks[0];
    if (verdict.type !== "Verdict") throw new ToolError("Block 1 must be Verdict.");
    const kpis = input.blocks.flatMap((block) => block.type === "KpiRow" ? block.props.items : []).slice(0, 4);

    const id = randomBytes(6).toString("base64url");
    const report: Report = {
      id,
      title: input.title,
      subtitle: input.subtitle,
      createdAt: new Date().toISOString(),
      question: run.question,
      blocks: input.blocks,
      skill: input.skill ?? run.skill,
      verdict: { ...verdict.props, tone: verdict.props.label.toLowerCase() as VerdictTone },
      kpis,
      charts,
      places: reportPlaces(input.blocks),
      evidence: run.evidence.map(({ tool, summary }) => ({ tool, summary: tool === "report" && summary === "report requested" ? `report ready: ${input.title}` : evidenceSummary(tool, summary) })),
      grounding: { numbers: grounding.numbers, grounded: grounding.grounded },
      model: run.model?.(),
    };
    if (!run.evidence.some((entry) => entry.tool === "report" && entry.summary === "report requested")) report.evidence.push({ tool: "report", summary: `report ready: ${input.title}` });
    const markdown = reportMarkdown(report);
    const filename = `${slug(report.title) || "twin-report"}.md`;
    await storePut(`reports/${id}.json`, report);
    run.reportId = id;
    if (run.user) await appendReport(run.user.name, run.user.code, { id, title: report.title, at: Date.now() }).catch(() => {});
    return {
      data: { id, url: `/r/${id}`, title: report.title, grounding: report.grounding },
      summary: `report ready: ${report.title}`,
      uiActions: [{ type: "report", id, title: report.title }, { type: "download", filename, markdown }],
    };
  },
});

export const REPORT_TOOLS = [chartTool, reportTool];
