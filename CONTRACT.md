# Twin — data contract (pipeline ⇄ web)

Product: **Twin** — find any neighbourhood's cultural twin in another city, using Qloo taste data.
Core method (validated in `probe/`): raw Qloo heatmap affinity ≈ popularity (density). We correct it:
per basket item, percentile-rank affinity across a city's cells → subtract each cell's mean rank over the basket
(density baseline) → z-score each item within the city. A cell's **fingerprint** is that vector over the basket.
Neighbourhood vector = mean of cell fingerprints within 1.3 km of its centroid. Similarity = cosine.

The pipeline (`pipeline/`, Python, stdlib only) writes static JSON into `web/public/data/`.
The web app (`web/`, Next.js) only reads these files (plus later a live agent API route).
All floats rounded to 3 dp. Coordinates are WGS84. `id`s are kebab-case.

## `web/public/data/meta.json`
```json
{ "generatedAt": "ISO", "method": "lift-v1", "radiusKm": 1.3, "basketSize": 100, "qlooCalls": 640,
  "cities": ["los-angeles", "..."] }
```

## `web/public/data/basket.json` — the fingerprint dimensions, index-aligned with every vector
```json
[{ "i": 0, "id": "artist-radiohead", "label": "Radiohead", "kind": "artist|brand|movie|tv|book|place-tag|podcast",
   "group": "music|fashion|food|nightlife|film|culture|lifestyle|sport" }]
```

## `web/public/data/cities.json`
```json
[{ "id": "berlin", "name": "Berlin", "country": "Germany", "center": [13.40, 52.52], "zoom": 10.5,
   "cellCount": 1245, "hoodCount": 18 }]
```
`center` is `[lon, lat]` (deck.gl / MapLibre order).

## `web/public/data/cells/{cityId}.json` — every geohash-6 cell kept for the city
```json
{ "city": "berlin", "cells": [
  { "g": "u33dc1", "lon": 13.41, "lat": 52.52, "d": 0.82, "v": [0.12, -1.3, ...], "top": [17, 4, 33] } ] }
```
- `d` = density (mean raw Qloo popularity over basket, 0–1) — used for the "raw Qloo" ablation view.
- `v` = corrected fingerprint (z-scores, aligned to basket.json).
- `top` = basket indices of the cell's 3 highest `v`.

## `web/public/data/hoods.json`
```json
[{ "id": "berlin-neukolln-reuterkiez", "city": "berlin", "name": "Neukölln (Reuterkiez)", "lon": 13.4255, "lat": 52.4895,
   "cells": 14, "v": [...], "top": [3, 9, 12, 40, 7], "blurb": "optional one-line description" }]
```

## `web/public/data/twins.json` — precomputed, keyed by hood id; top 5 twins in EACH other city
```json
{ "los-angeles-silver-lake": {
    "berlin": [ { "hood": "berlin-neukolln-reuterkiez", "score": 0.77,
                  "shared": [ { "i": 12, "a": 1.4, "b": 1.2 } ],
                  "diverge": [ { "i": 5, "a": 1.1, "b": -0.9 } ] } ],
    "london": [ ... ] } }
```
`shared` = 6 basket dims both hoods are high on (sorted by min(a,b) desc). `diverge` = 4 dims with largest |a-b|.

## `web/public/data/evals.json`
```json
{ "generatedAt": "ISO",
  "split": { "dev": 12, "test": 20 },
  "methods": {
    "twin":   { "label": "Twin (Qloo + density correction)", "hit1": 0.55, "hit3": 0.8, "mrr": 0.67, "n": 20 },
    "raw":    { "label": "Raw Qloo heatmaps (no correction)", ... },
    "llm":    { "label": "LLM only (Claude, no data)", ... },
    "random": { "label": "Random", ... } },
  "pairs": [ { "a": "los-angeles-silver-lake", "b": "berlin-neukolln-reuterkiez", "split": "test",
               "source": "url", "quote": "short quote",
               "rank": { "twin": 1, "raw": 4, "llm": 2, "random": 9 } } ],
  "basketSweep": [ { "size": 20, "mrr": 0.4 }, { "size": 40, "mrr": 0.55 } ],
  "radiusSweep": [ { "km": 0.8, "mrr": 0.6 } ],
  "sanity": [ { "city": "los-angeles", "hood": "Compton", "item": "Kendrick Lamar", "pct": 0.98, "raw_pct": 0.64 } ],
  "rawCollapse": { "twin_mean_cos_spread": 0.6, "raw_mean_cos_spread": 0.01 } }
```
Rank = rank of the ground-truth twin among all hoods of the target city (1 = best). hit@k / MRR over **test** pairs.

## Ground-truth rule
`pipeline/ground_truth.json` is written and committed **before** looking at model results. Every pair needs a
real published source (URL + quote) comparing the two neighbourhoods. Dev pairs may be used for tuning; test pairs never.
