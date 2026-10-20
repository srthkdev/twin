#!/usr/bin/env tsx
// Twin MCP server (stdio). Exposes the same tools as the in-app agent (lib/agent/tools.ts).
// Run:  pnpm mcp        (from web/)       or   npx tsx /abs/path/to/web/mcp/twin-mcp.mts
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.TWIN_WEB_ROOT ??= webRoot;
// Load web/.env.local without overriding real env (never printed).
const envFile = join(webRoot, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { TOOLS, executeTool } = await import("../lib/agent/tools");
const { loadDataSet } = await import("../lib/agent/node-data");
type Shape = Parameters<InstanceType<typeof McpServer>["registerTool"]>[1]["inputSchema"];

const server = new McpServer({ name: "twin", version: "0.1.0" });
const ds = await loadDataSet();

for (const t of TOOLS) {
  server.registerTool(
    t.name,
    { description: t.description, inputSchema: (t.schema as unknown as { shape: Shape }).shape },
    async (args: unknown) => {
      const r = await executeTool(t.name, args, ds);
      const meta = { summary: r.summary, ok: r.ok, uiActions: r.uiActions, qloo: r.qloo };
      return {
        isError: !r.ok,
        content: [
          { type: "text" as const, text: r.content },
          // Machine-readable trailer with map actions, for MCP clients that want to drive a UI.
          { type: "text" as const, text: `<twin-meta>${JSON.stringify(meta)}</twin-meta>` },
        ],
      };
    },
  );
}

await server.connect(new StdioServerTransport());
console.error("[twin-mcp] ready:", TOOLS.map((t) => t.name).join(", "));
