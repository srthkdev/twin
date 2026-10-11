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
- `/api/agent` deterministic data-backed agent. `lib/agent/tools.ts` (findTwins, explainMatch, listHoods) +
  `lib/agent/respond.ts` (intents: find / why / compare). Implement the `Agent` interface in `lib/agent/types.ts`
  with an LLM to drop in.
- `lib/similarity.ts` cosine + ranking; `lib/types.ts` mirrors CONTRACT.md.
