// Run the standard agent questions against each OpenRouter model through /api/agent and summarise.
// usage: node agent-bench.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3000";
const MODELS = ["minimax/minimax-m3.1-flash:free", "thinkingmachines/inkling:free", "nvidia/nemotron-3-ultra-550b-a55b:free"];
const QUESTIONS = [
  { q: "Find the Silver Lake of Berlin and tell me where I'd actually hang out there.", ctx: { fromHood: "los-angeles-silver-lake", toCity: "berlin" }, want: ["find_twins", "local_scene"] },
  { q: "Why are Williamsburg and Shoreditch similar, and where do they differ?", ctx: { fromHood: null, toCity: null }, want: ["explain_match"] },
  { q: "Where in London do Peso Pluma fans cluster, and what brands do they like?", ctx: { fromHood: null, toCity: "london" }, want: ["where_in_city", "cross_domain"] },
];

async function ask(model, { q, ctx }) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/agent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `bench-${Math.random()}` },
    body: JSON.stringify({ provider: "openrouter", model, context: ctx, messages: [{ role: "user", content: q }] }),
  });
  if (!res.ok) return { error: `${res.status} ${await res.text()}`, ms: Date.now() - t0 };
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", text = "", tools = [], done = null, error = null;
  for (;;) {
    const { done: d, value } = await reader.read(); if (d) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).replace(/^data: /, ""); buf = buf.slice(i + 2);
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.type === "text") text += e.delta;
      else if (e.type === "tool_result") tools.push(`${e.name}${e.ok ? "" : "✗"}`);
      else if (e.type === "done") done = e;
      else if (e.type === "error") error = e.message;
    }
  }
  return { text, tools, done, error, ms: Date.now() - t0 };
}

for (const model of MODELS) {
  console.log(`\n=== ${model}`);
  for (const item of QUESTIONS) {
    const r = await ask(model, item);
    const used = r.done?.provider ?? "-";
    const hit = item.want.filter((w) => r.tools?.some((t) => t.startsWith(w))).length;
    console.log(`- ${item.q.slice(0, 50)}…`);
    console.log(`  served by ${used} | ${(r.ms / 1000).toFixed(1)}s | tools [${(r.tools ?? []).join(", ")}] | expected tools ${hit}/${item.want.length} | qloo live ${r.done?.qlooLive ?? 0}${r.error ? ` | ERROR ${r.error}` : ""}`);
    console.log(`  > ${(r.text || "").replace(/\s+/g, " ").slice(0, 320)}`);
  }
}
