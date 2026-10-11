# twin

Every neighbourhood has a twin. Twin finds the cultural twin of any neighbourhood in another city — the Silver Lake of Berlin, the Williamsburg of London — from Qloo taste data, and an agent that helps you act on it.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

## How it works

Raw Qloo heatmap affinity is dominated by a popularity baseline: busy places score high for everything, so every neighbourhood looks alike (mean cross-city cosine 0.95). Twin removes it:

1. one Qloo heatmap per basket item (116 artists, brands, films, place types) per city, on ~1 km geohash cells
2. percentile-rank each item across a city's cells
3. subtract each cell's mean rank over the basket (its popularity baseline)
4. z-score each item within the city
5. a neighbourhood is the mean fingerprint of cells within 1.3 km; twins are ranked by cosine

The agent (Codex CLI locally, or bring your own Anthropic/OpenAI key) uses the fingerprints plus live Qloo calls — venues near a twin steered by your taste, audience skews, cross-domain brands. The same tools ship as an MCP server.

## Evals

Labels were committed before any result was computed.

- **Bias:** raw cross-city cosine 0.95 → 0.16 corrected.
- **Census (36 pre-registered tests, LA + NYC):** corrected beats raw in 21; e.g. Latin artists ↔ % Hispanic ρ 0.29 → 0.64. Worse on affluence.
- **Published twins (21 held-out pairs):** an LLM with no data wins (MRR 0.67 vs 0.34) — it has read the same articles; Twin reaches hit@3 0.45 from taste data alone (random 0.12).

Full results at `/evals` in the app and in `pipeline/README.md`.

## Layout

```
pipeline/   Python (stdlib) — fetch, correction, twins, evals, census check
web/        Next.js app — globe, explore, evals, method, agent, MCP server
probe/      first experiments that found the popularity bias
```

## Run

```bash
cd web && pnpm install && pnpm dev          # http://localhost:3000
```

The app ships with precomputed data in `web/public/data`. For live agent tools put `QLOO_API_KEY` and `QLOO_BASE_URL` in `web/.env.local`. To rebuild the data: `cd pipeline && python3 run_all.py` (needs the same two variables in `.env` at the repo root).

## License

MIT
