# Twin data pipeline (stdlib Python 3, no installs)

Finds each neighbourhood's cultural twin in other cities from Qloo heatmap data. Output goes to `web/public/data/` (see `/CONTRACT.md`).

## Method (`lift-v1`)
1. **Basket** (`basket.py`, pruned list in `basket_final2.json`): 116 globally recognised signals - artists (indie, hip-hop, latin, k-pop, techno, country, metal, afrobeats, mainstream), brands (luxury, streetwear, outdoor, wellness, mass-market), film/TV, comedy/podcast, sport, and `urn:tag:genre:place:*` tags (cuisines, bars, queer venues, record stores, galleries, gyms, golf/tennis clubs...). 162 candidates were resolved; 19 were dropped after the Los Angeles fetch (sparse/empty), 24 more were cut for redundancy before fetching the other cities (not for performance), and 3 were dropped for being sparse (<25% of a city's median heatmap size) in >2 cities (Parasite, Moonlight, Liga MX).
2. **Fetch** (`fetch.py`): one `urn:heatmap` insight per item x city. Every response is cached on disk (`cache/`, gitignored, keyed by sha1(url)); max 4 concurrent, backoff on 429/5xx. Cities whose query returns geohash-7 cells (Paris, Mexico City) are averaged up to geohash-6 so all cities share one grid.
   * Locality notes: `"New York"` resolves to the *state* (coarse cells) - we use `"New York City"` (covers Brooklyn/Queens, so no merge was needed). `"Los Angeles"` returns only the City of LA (no Beverly Hills, Santa Monica, Compton, Pasadena - these separate municipalities were absent from the raw data, not lost by a filter), so we use `"Los Angeles County"`. `"Paris"` is the 20 arrondissements only (no La Defense/Neuilly), so we use `"Paris and suburbs"`.
3. **Lift** (`lift.py`): keep cells present in >=35% of items; a missing item = that city's minimum affinity for the item. Per item: mid-rank percentile across cells -> subtract each cell's mean rank over the basket (density baseline) -> z-score within city. `d` = mean raw popularity (missing=0), `top` = 3 highest z.
4. **Hoods** (`hood_defs.py`, `hoods.py`): 139 curated neighbourhoods (21-26/city), centroids from knowledge, each verified to have >=3 cells within 1.3 km (only Iztapalapa has exactly 3). Vector = mean of cell vectors within 1.3 km (widen to 2 km if <3).
5. **Twins** (`twins.py`): cosine; top-5 per other city; `shared` = 6 dims both >0 by min(a,b); `diverge` = 4 largest |a-b|.
6. **Ground truth** (`ground_truth.py` -> `ground_truth.json`, committed *before* any evaluation): 31 published cross-city comparisons (URL + quote), seeded split (seed 20261030): 10 dev / 21 test. `verbatim=false` means the quote is a paraphrase/table row read from a search snippet or table rather than an exact string. Pairs the source itself called a "Stretch" (Eurocheapo) were excluded by a rule fixed up front. Caveat: most sources are travel/real-estate blogs and 24 of 31 pairs involve a New York hood, so this measures "does it find the nickname-equivalent", not absolute truth.
7. **Evals** (`evals.py`): rank of the true twin among *all* hoods of the target city, both directions (a->b and b->a; `n` counts directed instances). Methods: `twin`, `raw` (raw affinity, no correction), `llm` (`claude -p --model sonnet --tools ""`, same candidate list in alphabetical order, cached in `cache/llm/`), `random` (analytic). No parameters were tuned (radius 1.3 km, coverage 0.35 are the spec defaults; a dev check of coverage 0.2-0.7 moved dev MRR only 0.51-0.58, i.e. noise).

## Run
```
python3 run_all.py      # basket -> fetch (cached) -> evals (llm calls cached) -> export
python3 export.py       # just regenerate web/public/data from caches
```
Needs `.env` with `QLOO_BASE_URL`, `QLOO_API_KEY` (never logged) and the `claude` CLI for the LLM baseline. Real Qloo calls are counted in `cache/_calls.txt` -> `meta.json.qlooCalls` (1,039 including a few probe/test calls and retries).

## Results (test split: 21 pairs, 42 directed instances; N = 20-26 candidates, random MRR 0.156)
| Method | hit@1 | hit@3 | MRR |
|---|---|---|---|
| Twin (corrected) | 0.119 | 0.452 | 0.338 |
| Raw Qloo | 0.214 | 0.405 | 0.378 |
| LLM only (Sonnet) | 0.524 | 0.738 | 0.670 |
| Random | 0.041 | 0.124 | 0.156 |

Dev split (10 pairs, 20 directed): Twin 0.35 / 0.70 / 0.544, Raw 0.10 / 0.35 / 0.286, LLM 0.55 / 0.75 / 0.693.

**Honest reading:** Twin is far above random and (on dev) far above raw, but on the test split it is *not* better than raw on MRR/hit@1 and clearly loses to a no-data LLM. Test-set n is tiny (42), so CIs are wide (hit@1 of 0.12 vs 0.21 is 5 vs 9 instances). Twin does win head-to-head on some pairs (South Kensington-SoHo, Prenzlauer Berg-Park Slope, Soho-Chelsea, Peckham, Echo Park) and ranks the true twin top-3 in 45% of cases, but it misses wealth/business pairs (Canary Wharf-Financial District, Polanco-Beverly Hills, Condesa-SoHo, Islington-West Village). Mexico City is weakest: many Western basket items are sparse there, so its scores against other cities are low.

Raw collapse: mean cosine between hoods of different cities is 0.951 for raw vs 0.162 for corrected; spread (max-min per hood and target city) 0.109 vs 0.728. Basket sweep (MRR on all 31 pairs): 10 items 0.256, 20 0.277, 40 0.377, 60 0.399, all 116 0.404. Radius sweep MRR: 0.8 km 0.395, 1.3 km 0.404, 2.0 km 0.379, 3.0 km 0.355. See `web/public/data/evals.json` for the sanity table (corrected vs raw percentile; the correction deliberately lowers percentiles for items correlated with density, e.g. gay bars in Chelsea 0.67 corrected vs 0.97 raw).

## Known limitations
* Cell files: LA county has 4,770 cells; the exported file keeps the 3,478 within 18 km of a curated hood (2 dp) to stay under 2.5 MB. Vectors were computed on all cells.
* Basket `kind` includes `person` (comedians), which is not in the contract's kind list.
* Paris has only 926 geohash-6 cells (even with suburbs) and Mexico City 700 - coarser than LA/London.
