// Run each demo question once against the real agent with recording on; replays then cost nothing.
// usage: node record-runs.mjs [baseUrl] [onlyIndex]
const BASE = process.argv[2] ?? "http://localhost:3000";
const only = process.argv[3] != null ? Number(process.argv[3]) : null;
const name = (q) => q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
export const RUNS = [
  { q: "Find the Silver Lake of Berlin", ctx: { fromHood: "los-angeles-silver-lake", toCity: "berlin" } },
  { q: "I love Silver Lake. I'm moving to Neukölln — where do I actually go?", ctx: { fromHood: "los-angeles-silver-lake", toCity: "berlin" } },
  { q: "Where in Berlin should I open a natural wine bar?", ctx: { fromHood: null, toCity: "berlin" } },
  { q: "Plan a 3-city European tour for Peso Pluma", ctx: { fromHood: null, toCity: null } },
  { q: "What's the vibe of Shimokitazawa, Tokyo?", ctx: { fromHood: null, toCity: null } },
  { q: "Find the Shoreditch of Lisbon", ctx: { fromHood: "london-shoreditch", toCity: "lisbon" } },
];
for (const [i, r] of RUNS.entries()) {
  if (only !== null && i !== only) continue;
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record: name(r.q), context: r.ctx, messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: r.q }] }] }) });
  const text = await res.text();
  const tools = [], errs = []; let meta = null, out = "";
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    let e; try { e = JSON.parse(line.slice(6)); } catch { continue; }
    if (e.type === "tool-input-available") tools.push(e.toolName);
    if (e.type === "tool-output-available" && e.output?.ok === false) errs.push(`${e.output.summary}`);
    if (e.type === "error") errs.push(e.errorText);
    if (e.type === "text-delta") out += e.delta;
    if (e.type === "finish") meta = e.messageMetadata;
  }
  console.log(`\n[${i}] ${r.q}\n  ${((Date.now() - t0) / 1000).toFixed(0)}s · ${meta?.model ?? "-"} · qloo ${meta?.qlooLive ?? 0} live/${meta?.qlooCached ?? 0} cached\n  tools: ${tools.join(", ")}${errs.length ? `\n  ERR: ${errs.join(" | ").slice(0, 300)}` : ""}\n  > ${out.replace(/\s+/g, " ").slice(0, 260)}`);
}
