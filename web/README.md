# Twin — web app

Next.js 15 (App Router) · Tailwind v4 · shadcn/ui · MapLibre GL (globe) + deck.gl · Vercel AI SDK · Vercel Blob.

## Run

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm build && pnpm lint
```

Keys go in `web/.env.local` (gitignored): `QLOO_API_KEY`, `QLOO_BASE_URL`, `OPENROUTER_API_KEY`, and optionally
`TAVILY_API_KEY` (web search) and `BLOB_READ_WRITE_TOKEN` (shared cache; without it the cache is `web/.cache/twin`).

## Pages

| Route | What |
|---|---|
| `/` | Landing: globe of twin arcs, query box, the bias, method, evidence |
| `/explore` | Map + source panel + right panel (`twins` / `agent` tabs). `?from=<hoodId>&to=<cityId>&tab=agent` |
| `/evals` | Bias, census check, published-twin benchmark, sensitivity, sanity checks |
| `/method` | The correction, the 3D layer diagram, the agent, limits |
| `/blog` | The full write-up (`content/writeup.md`, also the Devpost text) |

## Data

The app reads the pipeline's output in `public/data/` (`basket`, `cities`, `hoods`, `twins`, `evals`, `cells/*`,
`core/*` for the 40-trait core basket, `supply/*` for Overture venue counts). Live cities added by the agent are
stored in the cache under `cities/<id>/` and served by `GET /api/cities` and `GET /api/cities/<id>/core`.

## Agent

- `app/api/agent/route.ts` — AI SDK `streamText` with tools over OpenRouter (free models with native fallback),
  streamed as a UI message stream. Tool progress (`data-progress`) and map actions (`data-action`) are transient data
  parts. The server's OpenRouter key is rate-limited per visitor; visitors can send their own in `x-agent-key`.
- `lib/agent/tools.ts`, `tools-v2.ts` — the 23 tools (zod schemas); `lib/agent/prompt.ts` — the playbook prompt.
  Reference: [`../docs/AGENT.md`](../docs/AGENT.md), regenerated with `pnpm exec tsx scripts/gen-agent-doc.mts`.
- `lib/agent/qloo.ts`, `city-live.ts`, `supply.ts`, `net.ts`, `web.ts`, `osm.ts` — sources; `store.ts` — the cache.
- `components/agent/agent-panel.tsx` — `useChat` UI: streaming markdown, reasoning, tool timeline with sources and
  timing, brief downloads, mic and read-aloud.

### Use Twin inside Claude Code / Codex / any MCP client

`mcp/twin-mcp.mts` serves the same tools over stdio (`pnpm mcp`). Replace `/ABS/PATH` with the absolute path to this `web/` folder.

Claude Code:

```bash
claude mcp add twin -- /ABS/PATH/web/node_modules/.bin/tsx /ABS/PATH/web/mcp/twin-mcp.mts
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.twin]
command = "/ABS/PATH/web/node_modules/.bin/tsx"
args = ["/ABS/PATH/web/mcp/twin-mcp.mts"]
default_tools_approval_mode = "approve"
```

Generic MCP client JSON:

```json
{ "mcpServers": { "twin": { "command": "/ABS/PATH/web/node_modules/.bin/tsx", "args": ["/ABS/PATH/web/mcp/twin-mcp.mts"] } } }
```

The server reads `web/.env.local` itself for the Qloo key, so the live Qloo tools work out of the box.
