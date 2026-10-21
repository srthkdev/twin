// Report mode contract, shared by the agent tools (server) and the report UI (client).
// Every number a chart or KPI shows must be traceable to a tool result in the same run (see lib/agent/report.ts).

/** A map link the UI can fly to: "hood:<hood_id>" or "geo:<lat>,<lon>". */
export type MapLink = string;

export type ChartKind = "bar" | "hbar" | "line" | "scatter" | "table";

export interface ChartSeries { name: string; values: number[] } // index-aligned with ChartSpec.labels

export interface ChartSpec {
  id: string;                 // assigned by the server ("fig-1", "fig-2", …), unique within a run
  kind: ChartKind;
  title: string;              // plain words, e.g. "Where the demand is"
  caption?: string;           // one line on how to read it
  unit?: string;              // "%", "venues", "match", …
  labels: string[];           // categories / rows (bar, hbar, line, table)
  series: ChartSeries[];      // 1–3 series
  points?: { label: string; x: number; y: number; link?: MapLink }[]; // scatter only
  axes?: { x?: string; y?: string };
  links?: (MapLink | null)[]; // per label; clicking a bar/row flies the map
  sources: string[];          // tool names whose results the numbers came from
}

export interface ReportSection { heading: string; body: string } // body: markdown; "[[fig-2]]" embeds a chart

export type VerdictTone = "go" | "watch" | "skip" | "info";

export interface Report {
  id: string;                 // short random id, also the share URL /r/<id>
  title: string;
  subtitle?: string;
  createdAt: string;          // ISO
  question?: string;          // the user's request that produced it
  verdict?: { label: string; tone: VerdictTone; line: string };
  kpis?: { label: string; value: string; note?: string }[]; // ≤ 4
  sections: ReportSection[];
  charts: ChartSpec[];
  places?: { label: string; link: MapLink; note?: string }[];
  evidence: { tool: string; summary: string }[]; // every tool call the run made, in order
  grounding: { numbers: number; grounded: number }; // numbers checked against tool results / how many passed
  model?: string;
}
