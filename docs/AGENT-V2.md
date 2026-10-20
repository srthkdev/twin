# Twin agent v2 — global data, real tools, opportunity map (spec)

Goal: nothing in the agent depends on the 6 hand-picked cities. Any city on Earth can be fingerprinted live from Qloo,
neighbourhoods and venues come from OpenStreetMap, context from Wikipedia and the web. Two new user-facing features:
the **opportunity map** (Qloo demand vs OSM supply) and the **tour planner**.

## Shared constraints
- Free sources only by default. Optional keys via env: `TAVILY_API_KEY`, `BRAVE_API_KEY` (web search upgrade).
- Every external call: timeout, on-disk cache under `web/.cache/twin/` (gitignored), polite User-Agent
  `twin-hackathon/0.1 (+https://github.com/srthkdev/twin)`. Nominatim ≤1 req/s. Overpass: try
  `https://overpass-api.de/api/interpreter`, then `https://overpass.kumi.systems/api/interpreter`.
- Qloo: `web/lib/agent/qloo.ts` client (cached). Never log keys.
- Commit as the user only: `git -c user.name=sarthak -c user.email=sarthak@getinsightxr.com commit`; NO co-author trailer. Do not push.

## Core basket (dimension contract for live cities)
`web/lib/agent/data/core-basket.json`: 40 items `{ id, label, kind, group, key, val }` (key/val = Qloo signal param,
same format as `pipeline/basket_final2.json`). Chosen offline from the 116-item basket: good coverage in all 6 cities,
diverse groups, high cross-cell variance. Ship `pipeline/core_basket.py` that selects them and reports dev-pair MRR
for the 40-item version vs 116 (must not tune on test pairs).

Static cities also get core-basket fingerprints so they can be compared with live cities on the same 40 dims:
`web/public/data/core/{cityId}.json` = `{ city, items: string[], cells: [{g,lon,lat,v}], hoods: [{id,name,lon,lat,v}] }`
(produced by the pipeline from cached raw data; same correction: percentile → minus cell mean → z within city).

## Live city API (server, Node runtime)
- `GET /api/cities` → `{ cities: City[] }` — static cities (`source:"static"`) + cached live ones (`source:"live"`).
  `City` = CONTRACT.md City plus `source`, `dims: 116|40`, optional `coverage: { cells, sparseItems }`.
- `POST /api/cities` `{ name }` → SSE: `{type:"progress", stage:"geocode"|"heatmaps"|"neighbourhoods"|"fingerprint", done, total, note}` …
  `{type:"done", city}` or `{type:"error", message}`. Idempotent: cached cities return `done` immediately.
  Steps: Nominatim geocode (bbox) → 40 Qloo heatmaps (`filter.location.query=<display name>`, ≤4 concurrent) →
  correction → neighbourhoods from Overpass (`place=suburb|quarter|neighbourhood` nodes inside bbox, top ~30 by
  population/rank, fallback Qloo locality search) → hood vector = mean of cells within 1.3 km (2 km if <3 cells) →
  write cache `web/.cache/twin/cities/{id}/{city.json,cells.json,hoods.json}` in the core format above.
  Report thin coverage honestly (`coverage`). Reject if <150 cells ("Qloo has too little data for X").
- `GET /api/cities/{id}/core` → the core-format file (static from public/data/core, live from cache).
- Cross-city twins between any two cities use core vectors.

## Agent tools (add to web/lib/agent/tools.ts; also exposed by the MCP server)
| tool | does |
|---|---|
| `add_city(name)` | runs the live pipeline above (progress → tool_result summary); returns city id + coverage |
| `geocode(query)` | Nominatim → name, lat, lon, bbox, type |
| `twins_anywhere(source, target_city, k)` | source = hood id OR free-text place (geocoded) OR lat/lon; works across static+live cities on core dims |
| `web_search(query, k)` | Tavily → Brave → DuckDuckGo HTML fallback; returns title, url, snippet |
| `read_page(url)` | `https://r.jina.ai/<url>` markdown, truncated to ~6k chars |
| `wiki(place)` | Wikipedia REST summary + coordinates + Wikidata population when available |
| `osm_venues(lat, lon, radius_m, kinds[])` | Overpass: counts + up to 15 named POIs per kind; kinds map to OSM tags (bar, cafe, nightclub, record_shop=shop=music, art_gallery=tourism=gallery, bookshop=shop=books, restaurant w/ cuisine, music_venue=amenity=music_venue …) |
| `opportunity(city, taste, kind)` | Qloo corrected demand for `taste` (artist/brand/tag; live heatmap + city baseline) per cell vs OSM supply count of `kind` per cell → score = z(demand) − z(log1p supply); returns top 10 cells with both numbers + uiAction `{type:"opportunity", city, cells:[{g,lon,lat,demand,supply,score}]}` |
| `tour(artist, cities[])` | corrected affinity of the artist per city (top cells/hoods) + Qloo places (music venues) near the best hood; ranks cities |
| `brief(title, sections[])` | returns markdown; uiAction `{type:"download", filename, markdown}` |

Existing tools keep working. Update the system prompt (`lib/agent/prompt.ts`) with tool strategies: verify venues
with osm_venues/web_search before recommending, say when coverage is thin, cite sources (URLs) for web facts,
prefer parallel tool calls, keep answers tight.

New `AgentAction` variants (lib/agent/types.ts): `{type:"addCity", city: City}`, `{type:"opportunity", ...}`,
`{type:"download", filename, markdown}`. Long-running tools may emit `{type:"progress", id, note}` StreamEvents.

## Frontend (web/)
- Data layer: cities list = `/api/cities` (fallback to static). Live cities load cells from `/api/cities/{id}/core`.
  Explore works for live cities (map, twins via core dims, traits labelled from core basket).
- Source panel: city tabs show live cities too; a `+ add city` input (POST /api/cities, inline progress line, then select it).
- Map: third mode in the toggle — `raw qloo | corrected | opportunity` (opportunity only when an opportunity result
  exists). Opportunity cells: columns height = score, amber = high demand + low supply, grey otherwise; tooltip shows demand/supply.
- Agent panel: render `progress` events as a single updating dim line; handle `download` (Blob → save .md);
  handle `addCity` (refresh city list, select it) and `opportunity` (switch map mode, fly to city).
- Visual language: existing tokens only (mono, amber primary, line borders, square corners). No new colours, gradients, rounded pills.
