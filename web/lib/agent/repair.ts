// Free models sometimes send tool arguments in shapes no schema expects: text as {"$text": "…"} (an XML-style
// tool-calling habit) or arrays/objects as JSON-encoded strings. Repair those deterministically before validation
// gives up, instead of letting the model burn steps retrying the same call.
import type { ToolCallRepairFunction, ToolSet } from "ai";

function unwrap(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(unwrap);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && (keys[0] === "$text" || keys[0] === "#text" || keys[0] === "_text") && typeof o[keys[0]] === "string") return o[keys[0]];
    return Object.fromEntries(keys.map((k) => [k, unwrap(o[k])]));
  }
  if (typeof v === "string") {
    const s = v.trim();
    if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("{") && s.endsWith("}"))) {
      try { return unwrap(JSON.parse(s)); } catch { /* a real string */ }
    }
  }
  return v;
}

type Obj = Record<string, unknown>;
const text = (v: unknown): string => typeof v === "string" ? v : v && typeof v === "object" ? Object.values(v as Obj).map(text).filter(Boolean).join(" — ") : v == null ? "" : String(v);
const cut = (s: unknown, n: number) => { const v = text(s); return v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v; };

/** Field limits from the catalog: trim instead of rejecting a whole report over one long sentence. */
const LIMITS: Record<string, Record<string, number>> = {
  Verdict: { line: 280 }, Heading: { text: 90 }, Paragraph: { markdown: 1600 }, Callout: { text: 400 },
};
const TYPE_ALIASES: Record<string, string> = {
  summary: "Paragraph", text: "Paragraph", markdown: "Paragraph", section: "Paragraph", body: "Paragraph", note: "Callout",
  title: "Heading", header: "Heading", h2: "Heading", kpis: "KpiRow", kpi: "KpiRow", metrics: "KpiRow", stats: "KpiRow",
  steps: "NextSteps", next_steps: "NextSteps", nextsteps: "NextSteps", actions: "NextSteps", risk: "Callout", risks: "Callout",
  caveat: "Callout", warning: "Callout", shortlist: "Ranking", ranking: "Ranking", list: "Ranking", comparison: "Compare",
  venues: "Places", places: "Places", table: "Table", chart: "Chart", figure: "Chart", verdict: "Verdict",
};
const CHART_KINDS: Record<string, string> = {
  grouped_bar: "bar", stacked_bar: "bar", column: "bar", columns: "bar", bars: "bar", histogram: "bar", pie: "hbar", donut: "hbar",
  horizontal_bar: "hbar", horizontal: "hbar", barh: "hbar", ranking: "hbar", area: "line", timeseries: "line", dot: "scatter", bubble: "scatter",
};

function fixBlock(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object") return [];
  const b = raw as Obj;
  const props = (b.props && typeof b.props === "object" ? b.props : Object.fromEntries(Object.entries(b).filter(([k]) => k !== "type"))) as Obj;
  const known = ["Verdict", "KpiRow", "Heading", "Paragraph", "Chart", "Ranking", "Compare", "Table", "Callout", "Places", "NextSteps"];
  let type = String(b.type ?? "");
  if (!known.includes(type)) type = TYPE_ALIASES[type.toLowerCase().replace(/[\s-]/g, "_")] ?? (props.markdown || props.text || props.body ? "Paragraph" : "");
  if (!type) return [];
  const p: Obj = { ...props };
  if (type === "Paragraph" && typeof p.markdown !== "string") { p.markdown = text(p.text ?? p.body ?? p.content ?? ""); delete p.text; delete p.body; delete p.content; }
  if (type === "Callout" && typeof p.text !== "string") p.text = text(p.markdown ?? p.body ?? "");
  if (type === "Callout" && !["risk", "caveat", "tip"].includes(String(p.tone))) p.tone = "caveat";
  if (type === "NextSteps" && Array.isArray(p.items)) p.items = p.items.map((i) => cut(i, 200)).filter(Boolean);
  if (type === "Compare" && Array.isArray(p.rows)) p.rows = p.rows.map((r) => ({ measure: text((r as Obj).measure) || "—", left: text((r as Obj).left) || "—", right: text((r as Obj).right) || "—" }));
  if (type === "Table" && Array.isArray(p.rows)) p.rows = p.rows.map((r) => (Array.isArray(r) ? r : Object.values(r as Obj)).map(text));
  if (type === "Ranking" && Array.isArray(p.items)) p.items = p.items.map((i) => ({ ...(i as Obj), reason: cut((i as Obj).reason ?? (i as Obj).note ?? "", 200) || "—" }));
  if (type === "Places" && Array.isArray(p.items)) p.items = p.items.map((i) => ((i as Obj).note ? { ...(i as Obj), note: cut((i as Obj).note, 160) } : i));
  for (const [k, n] of Object.entries(LIMITS[type] ?? {})) if (typeof p[k] === "string") p[k] = cut(p[k], n);
  return [{ type, props: p }];
}

function fixTool(name: string, args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  const a = { ...(args as Obj) };
  if (name === "report" && Array.isArray(a.blocks)) a.blocks = a.blocks.flatMap(fixBlock);
  if (name === "chart" && typeof a.kind === "string" && !["bar", "hbar", "line", "scatter", "table"].includes(a.kind)) a.kind = CHART_KINDS[a.kind.toLowerCase()] ?? "bar";
  return a;
}

export const repairToolCall: ToolCallRepairFunction<ToolSet> = async ({ toolCall }) => {
  try {
    const fixed = JSON.stringify(fixTool(toolCall.toolName, unwrap(JSON.parse(toolCall.input))));
    return fixed === toolCall.input ? null : { ...toolCall, input: fixed };
  } catch { return null; }
};
