// Writes docs/AGENT.md from the live tool registry and system prompt: `pnpm exec tsx scripts/gen-agent-doc.mts`
import { writeFileSync } from "node:fs";
import { TOOLS, jsonSchemaOf } from "../lib/agent/tools";
import { SYSTEM_PROMPT } from "../lib/agent/prompt";
import { OPENROUTER_MODELS } from "../lib/agent/ai";

const SOURCE: Record<string, string> = {
  local_scene: "Qloo (live)", audience: "Qloo (live)", cross_domain: "Qloo (live)", scene: "Qloo (live)", compare_taste: "Qloo (live)", trend: "Qloo (live)",
  tour: "Qloo (live)", opportunity: "Qloo demand + Overture supply", add_city: "Qloo heatmaps + OpenStreetMap",
  find_twins: "Twin fingerprints", explain_match: "Twin fingerprints", taste_profile: "Twin fingerprints", where_in_city: "Twin fingerprints (+ Qloo live)",
  pin_twins: "Twin fingerprints", twins_anywhere: "Twin fingerprints", list_cities: "Twin fingerprints", search_hoods: "Twin fingerprints",
  venue_supply: "Overture Maps (OSM fallback)", geocode: "OpenStreetMap Nominatim", web_search: "Tavily / web", read_page: "Jina Reader", wiki: "Wikipedia + Wikidata", brief: "—",
};
const params = (t: (typeof TOOLS)[number]) => {
  const s = jsonSchemaOf(t) as { properties?: Record<string, { description?: string; type?: string; enum?: string[] }>; required?: string[] };
  return Object.entries(s.properties ?? {}).map(([k, v]) => `\`${k}\`${s.required?.includes(k) ? "" : "?"}`).join(", ") || "—";
};
const rows = TOOLS.map((t) => `| \`${t.name}\` | ${SOURCE[t.name] ?? "—"} | ${params(t)} | ${t.description.replace(/\|/g, "/").replace(/\n/g, " ")} |`).join("\n");
const md = `# Twin agent — tools and instructions

_Generated from \`web/lib/agent/tools.ts\`, \`tools-v2.ts\` and \`prompt.ts\` by \`web/scripts/gen-agent-doc.mts\`. Do not edit by hand._

## Runtime
- **Framework:** Vercel AI SDK — \`streamText\` with tools, \`createUIMessageStream\` (tool progress and map actions stream as data parts), \`useChat\` on the client.
- **Models (free, via OpenRouter, native fallback in this order):** ${OPENROUTER_MODELS.map((m) => `\`${m}\``).join(" → ")}. Visitors can bring their own OpenRouter key.
- **Caching:** every Qloo / OpenStreetMap / Wikipedia / search response and every live city is cached in Vercel Blob (disk locally), so repeat questions cost nothing.
- **MCP:** the same tools are served over stdio by \`web/mcp/twin-mcp.mts\` (\`pnpm mcp\`).

## Tools (${TOOLS.length})
| Tool | Source | Arguments | What it does |
|---|---|---|---|
${rows}

## System prompt
\`\`\`markdown
${SYSTEM_PROMPT}
\`\`\`
`;
writeFileSync(new URL("../../docs/AGENT.md", import.meta.url), md);
console.log(`docs/AGENT.md: ${TOOLS.length} tools`);
