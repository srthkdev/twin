# Twin web app

Next.js 15 (App Router) + Tailwind v4 + shadcn/ui, MapLibre GL v5 (globe) + deck.gl 9 (interleaved), framer-motion, Recharts.

## Run

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build && pnpm start
pnpm lint
```

## Data

The app fetches static JSON at runtime (never bundled). The loader (`lib/data.ts`) reads `/data/*` (written by the
pipeline into `public/data/`) and falls back to `/data-mock/*` when `/data/meta.json` is missing. A "DEMO DATA" badge
shows in the nav when mock data is in use.

Regenerate mock data (writes only to `public/data-mock/`):

```bash
node scripts/mock-data.mjs
```

## Layout

- `/` landing (rotating globe + animated arcs, command-style finder, bug / method / evals sections)
- `/explore?from=<hoodId>&to=<cityId>` main app: fly-to, 3D column layer, Raw/Twin toggle, pins, swap, ⌘K, agent drawer
- `/evals` eval dashboard, `/method` explainer
- `/api/agent` the Twin agent (see "Agent" below). `lib/agent/respond.ts` is the offline rule-based fallback.
- `lib/similarity.ts` cosine + ranking; `lib/types.ts` mirrors CONTRACT.md.

## Agent

Honest framing: an LLM alone already knows famous twin pairs; it cannot see fine-grained, measured taste. The agent is
LLM reasoning plus Qloo as live evidence, and it must ground every claim in a tool result (`lib/agent/prompt.ts`).

Architecture:

- `lib/agent/tools.ts` is the single source of truth: zod-validated tools, run server-side.
  Data tools (static JSON in `public/data`): `list_cities`, `search_hoods`, `find_twins`, `explain_match`,
  `taste_profile`, `where_in_city` (falls back to a live Qloo heatmap for items outside the basket), `pin_twins`.
  Live Qloo tools (`lib/agent/qloo.ts`, `X-Api-Key`, timeouts, memory + disk cache): `local_scene`, `audience`, `cross_domain`.
  Tools also return UI actions (`flyTo`, `showTwins`, `highlightCells`) that `AgentPanel` hands to `onAction`.
- `POST /api/agent` streams SSE: `text`, `tool_call`, `tool_result` (with `uiActions`), `error`, `done`.
  `GET /api/agent/health` reports whether the Codex CLI runtime is available.
- Runtimes (`provider` in the request body):
  - `codex` (default locally when `codex` is on PATH and not on Vercel): spawns `codex exec --json -s read-only` in a temp dir
    with the Twin MCP server attached through `-c mcp_servers.twin.*` overrides (your `~/.codex/config.toml` is untouched).
    Killed on client disconnect or after 4 minutes.
  - `anthropic` (BYOK, `@anthropic-ai/sdk`, default `claude-sonnet-5-5`) and `openai` (BYOK, `openai` Responses API, default `gpt-5.5`):
    manual tool loop, max 8 rounds. The key is sent in the `x-agent-key` header per request; it is never stored or logged
    server-side. The UI keeps it in memory unless "remember" is ticked (then localStorage).
  - `offline`: the rule-based agent.
- UI: `components/agent/agent-panel.tsx` exports `AgentPanel({ context, onAction, className })`, which fills its parent
  (settings, streamed chat, collapsible tool trace, mic, read-aloud).

Setup: put `QLOO_API_KEY` and `QLOO_BASE_URL` in `web/.env.local` (gitignored). Without them the data tools still work.

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

The server reads `web/.env.local` itself for the Qloo key, so live tools (`local_scene`, `audience`, `cross_domain`) work out of the box.
