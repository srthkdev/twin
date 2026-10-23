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
  // a block type inside props ({props: {type: "Compare", …}}) wins: the outer one is then usually a slip
  let type = typeof props.type === "string" && known.includes(props.type) ? props.type : String(b.type ?? "");
  if (typeof props.type === "string" && known.includes(props.type)) delete props.type;
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

/** Map links in any shape models write ("geo:52.5,lon:13.3", "geo:lat=52.5,lon=13.3", "52.5,13.3") → geo:<lat>,<lon>. */
function fixLinks(v: unknown, key = ""): unknown {
  if (Array.isArray(v)) return v.map((x) => fixLinks(x, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Obj).map(([k, x]) => [k, fixLinks(x, k)]));
  if (typeof v === "string" && (key === "link" || key === "links") && !/^hood:/.test(v)) {
    const n = v.match(/-?\d+(?:\.\d+)?/g);
    if (n && n.length === 2) return `geo:${n[0]},${n[1]}`;
  }
  return v;
}

function fixTool(name: string, raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const a = { ...(fixLinks(raw) as Obj) };
  // axes as objects ({x: {type: "x"}}) → their title, if any
  if (name === "chart" && a.axes && typeof a.axes === "object") {
    const ax = a.axes as Obj;
    for (const k of ["x", "y"]) if (ax[k] && typeof ax[k] === "object") { const o = ax[k] as Obj; const t = o.title ?? o.label ?? o.name; if (typeof t === "string" && t) ax[k] = t; else delete ax[k]; }
  }
  if (name === "report" && Array.isArray(a.blocks)) a.blocks = a.blocks.flatMap(fixBlock);
  if (name === "chart" && typeof a.kind === "string" && !["bar", "hbar", "line", "scatter", "table"].includes(a.kind)) a.kind = CHART_KINDS[a.kind.toLowerCase()] ?? "bar";
  // a chart sent in Table-block shape ({columns, rows}) → labels from the first column, one series per numeric column
  if (name === "chart" && Array.isArray(a.rows) && Array.isArray(a.columns) && !Array.isArray(a.series)) {
    const rows = (a.rows as unknown[]).map((r) => (Array.isArray(r) ? r : Object.values(r as Obj)));
    const num = (v: unknown) => Number(String(v).replace(/[^0-9.+-]/g, ""));
    a.labels = rows.map((r) => text(r[0]));
    a.series = (a.columns as unknown[]).slice(1).map((c, j) => ({ name: text(c), values: rows.map((r) => num(r[j + 1])) }))
      .filter((s) => s.values.every(Number.isFinite)).slice(0, 3);
    delete a.rows; delete a.columns;
  }
  return a;
}

type Prop = { type?: string | string[]; minimum?: number; maximum?: number; maxItems?: number };
/** Numbers past a schema's bounds ("take": 10 when the max is 8) are clamped, long arrays trimmed: the intent is clear. */
function clamp(args: unknown, schema: { properties?: Record<string, Prop> }): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args) || !schema.properties) return args;
  const out = { ...(args as Obj) };
  for (const [k, p] of Object.entries(schema.properties)) {
    const v = out[k], types = ([] as string[]).concat(p.type ?? []);
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) && (types.includes("number") || types.includes("integer"))) out[k] = Number(v);
    if (typeof out[k] === "number") {
      let n = out[k] as number;
      if (types.includes("integer")) n = Math.round(n);
      if (p.maximum != null) n = Math.min(n, p.maximum);
      if (p.minimum != null) n = Math.max(n, p.minimum);
      out[k] = n;
    }
    if (Array.isArray(out[k]) && p.maxItems != null) out[k] = (out[k] as unknown[]).slice(0, p.maxItems);
  }
  return out;
}

export const repairToolCall: ToolCallRepairFunction<ToolSet> = async ({ toolCall, inputSchema }) => {
  try {
    const schema = await Promise.resolve(inputSchema({ toolName: toolCall.toolName })).catch(() => ({}));
    const fixed = JSON.stringify(clamp(fixTool(toolCall.toolName, unwrap(JSON.parse(toolCall.input))), schema as { properties?: Record<string, Prop> }));
    return fixed === toolCall.input ? null : { ...toolCall, input: fixed };
  } catch { return null; }
};
