<p align="center">
  <img src="web/public/media/wordmark.svg" alt="twin — every neighbourhood has a twin" width="460">
</p>

<p align="center">
  Find the Silver Lake of Berlin. Twin matches neighbourhoods across cities by what their residents and visitors actually like —<br>
  measured with <a href="https://qloo.com">Qloo</a> taste data, corrected for the popularity bias we found in it, and wrapped in an agent that helps you act on the answer.
</p>

<p align="center">
  <a href="#how-it-works">how it works</a> ·
  <a href="#evals">evals</a> ·
  <a href="#the-agent">agent</a> ·
  <a href="#run-it">run it</a> ·
  <a href="web/content/writeup.md">full write-up</a>
</p>

<p align="center"><img src="web/public/media/twin-explore.gif" alt="Silver Lake → Berlin: the camera flies across the globe, Berlin's blocks rise by similarity, the five closest neighbourhoods are ranked" width="100%"></p>

## What it does

| | |
|---|---|
| **Explore** | Pick a neighbourhood and every ~1 km block of its city lights up. Pick another city and the camera flies there; blocks rise by similarity and the five closest neighbourhoods are ranked, with the traits they share and where they differ. |
| **Drop a pin** | Click any block to use that exact cell as the source — not just a named neighbourhood. |
| **Read a block** | Height = likeness, colour = what it's mostly about (sound · table · scene). Hover for its traits and how many venues stand there; *ask* sends that block to the agent. |
| **Raw vs corrected** | One toggle shows the same map on raw Qloo scores, where everything busy looks alike. |
| **Any city** | Ask about a city we didn't precompute and the agent fingerprints it live from Qloo (≈40 heatmaps), then caches it. |
| **Agent** | 23 tools on free open models (MiniMax M3.1 Flash via OpenRouter), streamed as a timeline that folds away when the answer lands. Plain-language answers; every place is a link that flies the map; cited sources; one-click follow-ups; multi-turn memory that survives reloads. |
| **Opportunity map** | Qloo demand for a taste vs how many such venues physically exist (Overture Maps), cell by cell. |
| **MCP server** | The same tools, usable from Claude Code, Codex or any MCP client. |

## How it works

<img src="web/public/media/method-stack.gif" alt="the method as a stack of layers: raw affinity, minus each cell's baseline, equals lift; lift across 116 items is a fingerprint" width="100%">

Raw Qloo heatmap affinity tracks Qloo's own popularity score at **r = 0.97**: busy cells score high for everything, so on raw scores every neighbourhood looks the same (mean cross-city cosine **0.95**). Twin subtracts that:

```
r[c,i]  = percentile of cell c for item i, within its city      116 items × 6 cities, geohash-6 cells
v[c,i]  = z_i( r[c,i] − mean_j r[c,j] )                           ← the cell's popularity baseline, removed
v[hood] = mean of v[c] for cells within 1.3 km
twins   = top cosine(v[A], v[hood]) in the target city
```

<img src="web/public/media/raw-vs-corrected.gif" alt="the same Berlin map on raw scores (grey) and corrected (amber)" width="100%">

## Evals

All labels were committed before any result was computed (ground truth `edf9056`, census hypotheses `4965b70`). Losses are reported next to wins.

| Question | Result |
|---|---|
| Does the correction separate places? | Mean cross-city cosine **0.95 → 0.16**; best–worst spread per city **0.11 → 0.73** |
| Does the corrected map match the US census? (36 pre-registered tests, LA + NYC) | Corrected beats raw in **21 / 36**. Latin artists ↔ % Hispanic ρ **0.29 → 0.64**; soul food ↔ % Black **0.29 → 0.67**. Worse on affluence (luxury ↔ income turns negative). |
| Does it find twins people already name? (21 held-out published pairs) | **An LLM with no data wins** — MRR 0.67 vs Twin 0.34 (raw 0.38, random 0.16). It has read the same articles. Twin reaches hit@3 0.45 from taste data alone vs 0.12 random. |

<img src="web/public/media/evals-census.jpg" alt="census check: scatter of % Hispanic against corrected and raw taste scores, and the full table of 36 tests" width="100%">

So the product's claim is the honest one: the LLM reasons and knows the famous answers; Qloo supplies measured, block-level taste for everywhere nobody has written about. The agent uses both.

## The agent

<img src="web/public/media/agent.jpg" alt="the agent answering 'I love Silver Lake and I'm moving to Berlin' with Kreuzberg SO36 and venues returned live by Qloo" width="100%">

Qloo makes every taste decision; the other sources only do jobs Qloo can't:

| Question | Source | Tools |
|---|---|---|
| Twins, vibe, venue picks (hours, price), audiences, brands, momentum, demand | **Qloo** + Twin fingerprints | `find_twins`, `twins_anywhere`, `scene`, `local_scene`, `audience`, `cross_domain`, `compare_taste`, `trend`, `opportunity`, `tour`, `add_city` … |
| How many venues of a kind exist | Overture Maps Places (precomputed) | `venue_supply`, `opportunity` |
| Coordinates, new-city neighbourhoods | OpenStreetMap | `geocode`, `add_city` |
| Background facts | Wikipedia / Wikidata | `wiki` |
| Current events, news, closures | Web (Tavily) | `web_search`, `read_page` |

Full tool reference and the agent's playbook prompt: [`docs/AGENT.md`](docs/AGENT.md) (generated from the code).

**Try:** *find the Silver Lake of Berlin* · *I love Silver Lake, I'm moving to Neukölln — where do I go?* · *where in Berlin should I open a natural wine bar?* · *plan a 3-city European tour for Peso Pluma* · *what's the vibe of Shimokitazawa, Tokyo?* · *find the Shoreditch of Lisbon*

## Run it

```bash
cd web
pnpm install
pnpm dev                       # http://localhost:3000
```

The app ships with precomputed data in `web/public/data`. Put the keys in `web/.env.local`:

```
QLOO_API_KEY=...                      # Qloo hackathon key
QLOO_BASE_URL=https://hackathon.api.qloo.com
OPENROUTER_API_KEY=...                # free models; visitors can also bring their own
TAVILY_API_KEY=...                    # optional: web search
BLOB_READ_WRITE_TOKEN=...             # optional: shared cache (Vercel Blob); disk cache otherwise
```

Rebuild the data (cached, so re-runs are free): put the same two variables in `.env` at the repo root, then `cd pipeline && python3 run_all.py`.

## Layout

```
pipeline/        Python — basket, fetch, correction, twins, evals, census check, Overture venue supply (DuckDB)
web/             Next.js — globe, explore, evals, method, blog; AI SDK agent; MCP server
web/content/     the write-up (rendered at /blog)
probe/           the first experiments that found the popularity bias
```

<p align="center"><img src="web/public/media/logo.svg" width="28" alt=""><br><sub>MIT · built for the <a href="https://qloo.devpost.com/">Qloo Agentic Hackathon</a></sub></p>
