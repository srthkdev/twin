import React, { type ComponentType, type ReactNode } from "react";
import { defineCatalog, type Spec } from "@json-render/core";
import { createRenderer, defineRegistry, type ComponentMap } from "@json-render/react-pdf";
import { schema, standardComponentDefinitions } from "@json-render/react-pdf/server";
import { renderToBuffer } from "@json-render/react-pdf/render";
import { z } from "zod";
import type { ChartSpec, Report } from "../agent/report-types";
import { BLOCKS } from "./catalog";
import { evidenceSummary, reportBlocks } from "./normalize";

import * as pdf from "@react-pdf/renderer";

type Primitive = ComponentType<Record<string, unknown> & { children?: ReactNode }>;
const { Document, Page, View, Text, Svg, Rect, Line, Polyline, Circle } = pdf as unknown as Record<"Document" | "Page" | "View" | "Text" | "Svg" | "Rect" | "Line" | "Polyline" | "Circle", Primitive>;

const ink = "#20201d", muted = "#66665e", amber = "#a96708", rule = "#d9d7ce";
const colors = [amber, "#45453f", "#99978d"];
const bodyStyle = { fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.5, color: ink };
const labelStyle = { fontFamily: "Courier", fontSize: 8, lineHeight: 1.35, color: muted };
const titleStyle = { fontFamily: "Helvetica-Bold", fontSize: 14, lineHeight: 1.3, marginBottom: 7, marginTop: 12, color: ink };

export function pdfText(markdown: string) {
  return markdown.replace(/\[([^\]]+)\]\(([^\s]+?)(?:\s+"[^"]*")?\)/g, (_, label: string, target: string) => /^https?:\/\//.test(target) ? `${label} (${target})` : label)
    .replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*>\s?/gm, "")
    .replace(/```[^\n]*\n?|```/g, "").replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/(?<!\w)[*_]([^*_\n]+)[*_](?!\w)/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1").replace(/\\([*_`[\]\\])/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\u2212/g, "-");
}

function Prose({ text, small = false }: { text: string; small?: boolean }) {
  return <Text style={{ ...bodyStyle, ...(small ? { fontSize: 8, color: muted } : {}), marginBottom: 8 }} orphans={2} widows={2}>{pdfText(text)}</Text>;
}

function Grid({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const cell = { flex: 1, padding: 6, fontSize: 8, lineHeight: 1.4 };
  return <View style={{ marginBottom: 10 }}>
    <View wrap={false} style={{ flexDirection: "row", backgroundColor: "#f1eee5", borderBottomWidth: 1, borderBottomColor: rule }}>
      {columns.map((column, i) => <Text key={i} style={{ ...cell, fontFamily: "Helvetica-Bold" }}>{pdfText(column)}</Text>)}
    </View>
    {rows.map((row, i) => <View key={i} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: rule }}>
      {columns.map((_, j) => <Text key={j} style={cell}>{pdfText(row[j] ?? "")}</Text>)}
    </View>)}
  </View>;
}

function extent(values: number[], zero = false): [number, number] {
  let min = Math.min(...values), max = Math.max(...values);
  if (!values.length) return [0, 1];
  if (zero) { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) { min -= 0.5; max += 0.5; }
  return [min, max];
}
const number = (value: number) => Number(value.toFixed(3)).toLocaleString("en-US");
const short = (value: string, size = 17) => value.length > size ? `${value.slice(0, size - 3)}...` : value;

function chartChunks(chart: ChartSpec) {
  if (chart.kind !== "hbar" || chart.labels.length <= 8) return [chart];
  return Array.from({ length: Math.ceil(chart.labels.length / 8) }, (_, i) => ({ ...chart, labels: chart.labels.slice(i * 8, i * 8 + 8), series: chart.series.map((series) => ({ ...series, values: series.values.slice(i * 8, i * 8 + 8) })) }));
}

/** Round axis: steps of 1, 2, 2.5 or 5 × 10^k, so ticks read 0 · 20 · 40, never 61.725. */
function nice([lo, hi]: [number, number], n = 4) {
  const raw = (hi - lo || Math.abs(hi) || 1) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => +(min + i * step).toFixed(10)) };
}

function Plot({ chart }: { chart: ChartSpec }) {
  const width = 499, left = chart.kind === "hbar" ? 136 : 52, right = 32, top = 20;
  const plotWidth = width - left - right;
  const height = chart.kind === "hbar" ? Math.max(125, chart.labels.length * (chart.series.length * 10 + 14)) : 215;
  const bottom = height - 40, plotHeight = bottom - top;
  const values = chart.series.flatMap((series) => series.values);
  const { min, max, ticks } = nice(extent(values, true));
  const y = (value: number) => bottom - (value - min) / (max - min) * plotHeight;
  const x = (value: number) => left + (value - min) / (max - min) * plotWidth;
  const textProps = { fontFamily: "Helvetica", fontSize: 7, fill: muted };
  let drawing: ReactNode;
  if (chart.kind === "hbar") {
    const band = plotHeight / chart.labels.length;
    drawing = <>
      {ticks.map((value, i) => <React.Fragment key={i}><Line x1={x(value)} x2={x(value)} y1={top} y2={bottom} stroke={rule} strokeWidth={0.5} /><Text x={x(value)} y={bottom + 13} textAnchor="middle" {...textProps}>{number(value)}</Text></React.Fragment>)}
      {chart.labels.map((label, i) => <React.Fragment key={i}>
        <Text x={left - 7} y={top + band * (i + 0.5) + 2} textAnchor="end" {...textProps}>{short(label, 26)}</Text>
        {chart.series.map((series, j) => {
          const value = series.values[i], h = Math.min(10, (band - 8) / chart.series.length);
          const rowY = top + i * band + 4 + j * h;
          return <React.Fragment key={j}><Rect x={Math.min(x(0), x(value))} y={rowY} width={Math.max(0.4, Math.abs(x(value) - x(0)))} height={Math.max(1, h - 1)} fill={colors[j]} /><Text x={Math.min(width - 2, x(value) + 3)} y={rowY + h - 1} {...textProps}>{number(value)}</Text></React.Fragment>;
        })}
      </React.Fragment>)}
    </>;
  } else if (chart.kind === "scatter") {
    const points = chart.points ?? [];
    const { min: xMin, max: xMax, ticks: xTicks } = nice(extent(points.map((point) => point.x)));
    const { min: yMin, max: yMax, ticks: yTicks } = nice(extent(points.map((point) => point.y)));
    const sx = (value: number) => left + (value - xMin) / (xMax - xMin) * plotWidth;
    const sy = (value: number) => bottom - (value - yMin) / (yMax - yMin) * plotHeight;
    drawing = <>
      {yTicks.map((vy, i) => <React.Fragment key={`y${i}`}><Line x1={left} x2={width - right} y1={sy(vy)} y2={sy(vy)} stroke={rule} strokeWidth={0.5} /><Text x={left - 6} y={sy(vy) + 2} textAnchor="end" {...textProps}>{number(vy)}</Text></React.Fragment>)}
      {xTicks.map((vx, i) => <Text key={`x${i}`} x={sx(vx)} y={bottom + 13} textAnchor="middle" {...textProps}>{number(vx)}</Text>)}
      {points.map((point, i) => <React.Fragment key={i}><Circle cx={sx(point.x)} cy={sy(point.y)} r={3} fill={amber} /><Text x={Math.min(width - 85, Math.max(left, sx(point.x) + 5))} y={sy(point.y) - 5} {...textProps}>{short(point.label, 19)}</Text></React.Fragment>)}
    </>;
  } else {
    const band = plotWidth / chart.labels.length;
    const position = (i: number) => left + band * (i + 0.5);
    drawing = <>
      {ticks.map((value, i) => <React.Fragment key={i}><Line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke={rule} strokeWidth={0.5} /><Text x={left - 6} y={y(value) + 2} textAnchor="end" {...textProps}>{number(value)}</Text></React.Fragment>)}
      {chart.labels.map((label, i) => i % Math.max(1, Math.ceil(chart.labels.length / 6)) === 0 || i === chart.labels.length - 1 ? <Text key={i} x={position(i)} y={bottom + 13} textAnchor="middle" {...textProps}>{short(label, 14)}</Text> : null)}
      {chart.series.map((series, j) => chart.kind === "line" ? <React.Fragment key={j}>
        <Polyline points={series.values.map((value, i) => `${position(i)},${y(value)}`).join(" ")} stroke={colors[j]} strokeWidth={1.5} fill="none" />
        {series.values.map((value, i) => <Circle key={i} cx={position(i)} cy={y(value)} r={2} fill={colors[j]} />)}
      </React.Fragment> : series.values.map((value, i) => {
        const barWidth = Math.max(1, band * 0.8 / chart.series.length);
        return <Rect key={`${j}-${i}`} x={left + i * band + band * 0.1 + j * barWidth} y={Math.min(y(0), y(value))} width={barWidth - 0.5} height={Math.max(0.4, Math.abs(y(value) - y(0)))} fill={colors[j]} />;
      }))}
    </>;
  }
  return <>
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {drawing}
      <Line x1={left} x2={width - right} y1={bottom} y2={bottom} stroke={muted} strokeWidth={0.7} />
      <Text x={left} y={height - 4} {...textProps}>{pdfText(chart.axes?.x ?? (chart.kind === "hbar" ? chart.unit ?? "" : ""))}</Text>
      <Text x={left} y={9} {...textProps}>{pdfText(chart.axes?.y ?? (chart.kind !== "hbar" ? chart.unit ?? "" : ""))}</Text>
    </Svg>
    {chart.kind !== "scatter" && <View style={{ flexDirection: "row", gap: 16, marginBottom: 4 }}>{chart.series.map((series, i) => <Text key={i} style={{ ...labelStyle, color: colors[i] }}>{pdfText(series.name)}</Text>)}</View>}
  </>;
}

const pdfCatalog = defineCatalog(schema, { components: {
  ...BLOCKS,
  Document: standardComponentDefinitions.Document,
  Page: standardComponentDefinitions.Page,
  Header: { props: z.object({ title: z.string(), subtitle: z.string().optional(), date: z.string() }) },
  Footer: { props: z.object({ title: z.string(), date: z.string(), url: z.string() }) },
  Chart: { props: z.object({ chart: z.custom<ChartSpec>(), note: z.string().optional() }) },
  EvidenceItem: { props: z.object({ tool: z.string(), summary: z.string(), index: z.number() }) },
  Grounding: { props: z.object({ numbers: z.number(), grounded: z.number(), model: z.string().optional(), skill: z.string().optional() }) },
} });

export const { registry: pdfRegistry } = defineRegistry(pdfCatalog, { components: {
  Document: ({ children, props }) => <Document title={props.title ?? undefined} subject={props.subject ?? undefined} author="Twin" creator="Twin">{children}</Document>,
  Page: ({ children }) => <Page size="A4" wrap style={{ fontFamily: "Helvetica", fontSize: 10, color: ink, paddingTop: 42, paddingBottom: 68, paddingHorizontal: 48, backgroundColor: "#ffffff" }}>{children}</Page>,
  Header: ({ props }) => <View style={{ borderTopWidth: 3, borderTopColor: amber, paddingTop: 12, marginBottom: 14 }}>
    <Text style={{ ...labelStyle, color: amber, marginBottom: 10 }}>TWIN / FIELD REPORT / {props.date}</Text>
    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 25, lineHeight: 1.15, color: ink, marginBottom: 10 }}>{pdfText(props.title)}</Text>
    {props.subtitle && <Prose text={props.subtitle} />}
  </View>,
  Footer: ({ props }) => <View fixed style={{ position: "absolute", bottom: 25, left: 48, right: 48, height: 31, borderTopWidth: 0.5, borderTopColor: rule, paddingTop: 7 }}>
    <Text style={{ fontFamily: "Courier", fontSize: 7, color: muted, height: 12 }} render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${short(pdfText(props.title), 70)} / ${props.date} / ${pageNumber} of ${totalPages}`} />
    <Text style={{ ...labelStyle, fontSize: 7, height: 12 }}>{props.url}</Text>
  </View>,
  Verdict: ({ props }) => <View wrap={false} style={{ borderLeftWidth: 3, borderLeftColor: amber, backgroundColor: "#fbf6e9", padding: 12, marginBottom: 14 }}>
    <Text style={{ ...labelStyle, fontFamily: "Courier-Bold", color: amber, marginBottom: 5 }}>{props.label}</Text><Prose text={props.line} />
  </View>,
  KpiRow: ({ props }) => <View wrap={false} style={{ flexDirection: "row", marginBottom: 16, borderBottomWidth: 0.5, borderBottomColor: rule, paddingBottom: 10 }}>
    {props.items.map((item, i) => <View key={i} style={{ flex: 1, paddingRight: 10 }}>
      <Text style={{ ...labelStyle, marginBottom: 5 }}>{pdfText(item.label)}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 17, lineHeight: 1.3, color: ink, marginBottom: 4 }}>{pdfText(item.value)}</Text>
      {item.note && <Prose text={item.note} small />}
    </View>)}
  </View>,
  Heading: ({ props }) => <Text minPresenceAhead={38} style={titleStyle}>{pdfText(props.text)}</Text>,
  Paragraph: ({ props }) => <Prose text={props.markdown} />,
  Chart: ({ props: { chart, note } }) => <View style={{ marginTop: 6, marginBottom: 14 }}>{chartChunks(chart).map((chunk, i) => <View key={i} wrap={chart.kind === "table"}>
    <Text minPresenceAhead={40} style={{ ...titleStyle, fontSize: 11, marginTop: 0 }}>{pdfText(chart.title)}{i > 0 ? " (continued)" : ""}</Text>
    {chart.caption && <Prose text={chart.caption} small />}
    {chart.kind === "table" ? <Grid columns={["Place", ...chart.series.map((series) => series.name)]} rows={chart.labels.map((label, index) => [label, ...chart.series.map((series) => number(series.values[index]))])} /> : <Plot chart={chunk} />}
    <Prose small text={[note, chart.unit ? `Unit: ${chart.unit}` : undefined, `Sources: ${chart.sources.join(", ") || "tool evidence"}`].filter(Boolean).join(" · ")} />
  </View>)}</View>,
  Ranking: ({ props }) => <View style={{ marginBottom: 8 }}>
    <Text minPresenceAhead={40} style={titleStyle}>{pdfText(props.title)}</Text>
    {props.items.map((item, i) => <View key={i} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: rule, paddingVertical: 7 }}>
      <Text style={{ ...labelStyle, width: 24, color: amber }}>{String(i + 1).padStart(2, "0")}</Text>
      <View style={{ flex: 1 }}><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 3 }}>{pdfText(item.label)}{item.metric ? ` / ${pdfText(item.metric)}` : ""}</Text><Prose text={item.reason} /></View>
    </View>)}
  </View>,
  Compare: ({ props }) => <Grid columns={["Measure", props.left.title, props.right.title]} rows={props.rows.map((row) => [row.measure, row.left, row.right])} />,
  Table: ({ props }) => <View><Grid columns={props.columns} rows={props.rows} />{props.caption && <Prose text={props.caption} small />}</View>,
  Callout: ({ props }) => <View wrap={false} style={{ borderLeftWidth: 2, borderLeftColor: props.tone === "risk" ? ink : amber, backgroundColor: "#f7f6f1", padding: 10, marginVertical: 10 }}>
    <Text style={{ ...labelStyle, color: amber, marginBottom: 4 }}>{props.tone.toUpperCase()}</Text><Prose text={props.text} />
  </View>,
  Places: ({ props }) => <View><Text minPresenceAhead={40} style={titleStyle}>Places</Text>{props.items.map((item, i) => <View key={i} wrap={false} style={{ marginBottom: 6 }}><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{pdfText(item.label)}</Text>{item.note && <Prose text={item.note} />}</View>)}</View>,
  NextSteps: ({ props }) => <View><Text minPresenceAhead={40} style={titleStyle}>Next steps</Text>{props.items.map((item, i) => <Prose key={i} text={`${i + 1}. ${item}`} />)}</View>,
  EvidenceItem: ({ props }) => <View wrap={false} style={{ borderBottomWidth: 0.5, borderBottomColor: rule, marginBottom: 8, paddingBottom: 5 }}>
    <Text style={{ ...labelStyle, fontFamily: "Courier-Bold", marginBottom: 4 }}>{props.index}. {props.tool}</Text><Prose small text={props.summary} />
  </View>,
  Grounding: ({ props }) => <View style={{ marginTop: 12 }}><Prose text={`${props.grounded} of ${props.numbers} checked numbers matched tool evidence.`} />
    <Prose small text="Numbers are checked against this run's tool results, allowing rounding and percentage conversion. This checks numeric support, not whether a conclusion follows. Years, list ordinals and link targets are excluded from narrative checks." />
    {props.skill && <Prose small text={`Playbook: ${props.skill}`} />}{props.model && <Prose small text={`Model: ${props.model}`} />}
  </View>,
} });

export const ReportPdfRenderer = createRenderer(pdfCatalog, pdfRegistry as ComponentMap<typeof pdfCatalog.data.components>);

export function reportPdfSpec(report: Report): Spec {
  const elements: Spec["elements"] = {};
  const add = (type: string, props: Record<string, unknown>, children?: string[]) => {
    const id = `pdf-${Object.keys(elements).length}`;
    elements[id] = { type, props, ...(children ? { children } : {}) };
    return id;
  };
  const date = report.createdAt.slice(0, 10);
  const footer = () => add("Footer", { title: report.title, date, url: `twin-jade-rho.vercel.app/r/${report.id}` });
  const header = add("Header", { title: report.title, subtitle: report.subtitle, date });
  const blocks = reportBlocks(report).map((block) => {
    if (block.type !== "Chart") return add(block.type, block.props);
    const chart = report.charts.find((item) => item.id === block.props.id);
    return chart ? add("Chart", { chart, note: block.props.note }) : add("Callout", { tone: "caveat", text: "This chart is unavailable in the stored report." });
  });
  const page = add("Page", {}, [footer(), header, ...blocks]);
  const evidence = add("Page", {}, [footer(), add("Heading", { text: "Evidence" }),
    add("Paragraph", { markdown: "Tool calls recorded for this report, in order. Counts from open map data can be incomplete; taste measures do not predict business outcomes." }),
    ...report.evidence.map((item, i) => add("EvidenceItem", { tool: item.tool, summary: evidenceSummary(item.tool, item.summary), index: i + 1 })),
    add("Grounding", { ...report.grounding, model: report.model, skill: report.skill }),
  ]);
  const root = add("Document", { title: report.title, author: "Twin", subject: report.question ?? report.subtitle ?? "Twin field report" }, [page, evidence]);
  return { root, elements };
}

export async function renderReportPdf(report: Report) {
  return renderToBuffer(reportPdfSpec(report), { registry: pdfRegistry });
}
