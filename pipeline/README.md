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

## Census validation (external, `census.py`)
Question: does the density correction recover real cultural geography, judged against data Qloo never saw? 18 hypotheses (item(s) <-> ACS variable <-> expected sign) were written to `census_hypotheses.json` and committed (`384afef`) **before any correlation was computed**; each is run in Los Angeles County and NYC (36 tests, none dropped). Only the 3 scatter plots shown in the app were picked before seeing results (Latin artists, luxury brands, Korean food; LA).

**Data.** ACS 5-year 2023 tract estimates (`api.census.gov` now demands a key, so we used the table-based summary-file bulk download on `www2.census.gov`, same numbers) plus the 2023 Gazetteer tract internal points; cached in `cache/census/` (gitignored). Each tract goes to the geohash-6 cell holding its internal point; counts are summed per cell, so percentages are ratio-of-sums. **Medians (income, age) are the population-weighted mean of tract medians**, which is not a true cell median. Cells need population >= 500 and to exist in the Qloo data (LA 1,717 of 4,770 Qloo cells, NYC 944 of 1,365; Qloo cells are mostly commercial/activity locations, so many have no resident tract point). Spearman across cells; corrected = mean `V` over the hypothesis items, raw = mean `RAW`, density = `d`. 95% CI: 1,000 seeded bootstrap resamples of cells (ranks fixed on the full sample, percentile interval).

| city | hypothesis | exp. | corrected rho [95% CI] | raw rho [95% CI] | density rho | n cells |
|---|---|---|---|---|---|---|
| los-angeles | H01 Latin artists ↔ % Hispanic | + | +0.64 [+0.61,+0.67] | +0.29 [+0.24,+0.33] | -0.24 | 1717 |
| los-angeles | H02 Tacos ↔ % Hispanic | + | +0.33 [+0.29,+0.38] | +0.10 [+0.05,+0.14] | -0.24 | 1717 |
| los-angeles | H03 Korean food ↔ % Korean | + | +0.20 [+0.16,+0.25] | +0.30 [+0.26,+0.35] | +0.22 | 1717 |
| los-angeles | H04 BTS ↔ % Asian | + | +0.08 [+0.03,+0.13] | +0.14 [+0.10,+0.19] | +0.07 | 1717 |
| los-angeles | H05 Dim sum + Chinese food ↔ % Chinese | + | +0.11 [+0.07,+0.16] | +0.20 [+0.15,+0.24] | +0.09 | 1717 |
| los-angeles | H06 Luxury brands ↔ median income | + | -0.17 [-0.21,-0.12] | -0.10 [-0.15,-0.05] | -0.07 | 1708 |
| los-angeles | H07 Golf + tennis clubs ↔ median income | + | +0.37 [+0.33,+0.41] | +0.15 [+0.10,+0.20] | -0.07 | 1708 |
| los-angeles | H08 Outdoor/wellness brands ↔ % bachelor's+ | + | +0.50 [+0.46,+0.54] | +0.43 [+0.40,+0.47] | +0.29 | 1717 |
| los-angeles | H09 Whole Foods + Aesop + organic ↔ % bachelor's+ | + | +0.48 [+0.45,+0.52] | +0.42 [+0.38,+0.46] | +0.29 | 1717 |
| los-angeles | H10 Night clubs + cocktail bars ↔ median age | - | -0.05 [-0.10,-0.00] | -0.01 [-0.06,+0.03] | -0.02 | 1717 |
| los-angeles | H11 Kendrick + Beyoncé ↔ % Black | + | +0.36 [+0.32,+0.41] | +0.18 [+0.14,+0.23] | +0.07 | 1717 |
| los-angeles | H12 Soul food ↔ % Black | + | +0.38 [+0.34,+0.42] | +0.31 [+0.27,+0.35] | +0.07 | 1717 |
| los-angeles | H13 Morgan Wallen + Harley-Davidson ↔ % non-Hispanic white | + | +0.01 [-0.03,+0.06] | +0.26 [+0.21,+0.30] | +0.25 | 1717 |
| los-angeles | H14 Fast food ↔ median income | - | -0.20 [-0.25,-0.16] | -0.18 [-0.23,-0.13] | -0.07 | 1708 |
| los-angeles | H15 McDonald's + Walmart ↔ median income | - | -0.28 [-0.32,-0.23] | -0.16 [-0.21,-0.12] | -0.07 | 1708 |
| los-angeles | H16 Real Madrid + FC Barcelona ↔ % Hispanic | + | +0.41 [+0.37,+0.45] | -0.04 [-0.09,+0.01] | -0.24 | 1717 |
| los-angeles | H17 Caribbean food ↔ % Black | + | +0.33 [+0.28,+0.37] | +0.19 [+0.15,+0.24] | +0.07 | 1717 |
| los-angeles | H18 Fine dining + wine bars ↔ median income | + | +0.35 [+0.31,+0.39] | +0.16 [+0.12,+0.21] | -0.07 | 1708 |
| new-york | H01 Latin artists ↔ % Hispanic | + | +0.49 [+0.44,+0.54] | +0.31 [+0.25,+0.37] | +0.08 | 944 |
| new-york | H02 Tacos ↔ % Hispanic | + | -0.15 [-0.21,-0.09] | -0.03 [-0.09,+0.03] | +0.08 | 944 |
| new-york | H03 Korean food ↔ % Korean | + | +0.48 [+0.43,+0.54] | +0.52 [+0.47,+0.57] | +0.31 | 944 |
| new-york | H04 BTS ↔ % Asian | + | +0.10 [+0.03,+0.16] | +0.14 [+0.09,+0.20] | +0.02 | 944 |
| new-york | H05 Dim sum + Chinese food ↔ % Chinese | + | +0.34 [+0.27,+0.40] | +0.39 [+0.34,+0.45] | +0.08 | 944 |
| new-york | H06 Luxury brands ↔ median income | + | -0.29 [-0.34,-0.23] | -0.01 [-0.07,+0.06] | +0.06 | 943 |
| new-york | H07 Golf + tennis clubs ↔ median income | + | +0.04 [-0.02,+0.10] | +0.10 [+0.03,+0.17] | +0.06 | 943 |
| new-york | H08 Outdoor/wellness brands ↔ % bachelor's+ | + | +0.19 [+0.13,+0.25] | +0.39 [+0.34,+0.45] | +0.34 | 944 |
| new-york | H09 Whole Foods + Aesop + organic ↔ % bachelor's+ | + | +0.40 [+0.34,+0.45] | +0.44 [+0.39,+0.49] | +0.34 | 944 |
| new-york | H10 Night clubs + cocktail bars ↔ median age | - | -0.05 [-0.11,+0.01] | -0.20 [-0.26,-0.14] | -0.24 | 944 |
| new-york | H11 Kendrick + Beyoncé ↔ % Black | + | +0.32 [+0.26,+0.38] | -0.10 [-0.16,-0.04] | -0.09 | 944 |
| new-york | H12 Soul food ↔ % Black | + | +0.67 [+0.63,+0.71] | +0.29 [+0.24,+0.35] | -0.09 | 944 |
| new-york | H13 Morgan Wallen + Harley-Davidson ↔ % non-Hispanic white | + | +0.05 [-0.01,+0.12] | +0.27 [+0.21,+0.33] | +0.20 | 944 |
| new-york | H14 Fast food ↔ median income | - | +0.12 [+0.06,+0.18] | +0.16 [+0.10,+0.23] | +0.06 | 943 |
| new-york | H15 McDonald's + Walmart ↔ median income | - | -0.30 [-0.35,-0.24] | -0.06 [-0.12,+0.01] | +0.06 | 943 |
| new-york | H16 Real Madrid + FC Barcelona ↔ % Hispanic | + | +0.14 [+0.08,+0.20] | +0.11 [+0.05,+0.17] | +0.08 | 944 |
| new-york | H17 Caribbean food ↔ % Black | + | +0.50 [+0.44,+0.54] | +0.43 [+0.38,+0.49] | -0.09 | 944 |
| new-york | H18 Fine dining + wine bars ↔ median income | + | +0.42 [+0.37,+0.47] | +0.35 [+0.29,+0.41] | +0.06 | 943 |

**Summary (36 tests).** Correct sign: corrected 32, raw 30. Correct sign with CI excluding 0: corrected 27, raw 28. Corrected beats raw (signed in expected direction): 21 of 36 (LA 13/18, NYC 8/18). Mean |rho|: corrected 0.286, raw 0.220; mean signed rho (expected direction): 0.246 vs 0.196.

**Honest interpretation.**
* The data support the weak form of the claim: Qloo's taste signal has real, external, cultural-geography content, and the correction usually sharpens it. The clearest wins are ethnic/cultural-community items where raw is diluted by density: Latin artists <-> % Hispanic (LA 0.64 vs 0.29), Real Madrid/Barca <-> % Hispanic in LA (0.41 vs -0.04), soul food <-> % Black in NYC (0.67 vs 0.29), Kendrick/Beyonce <-> % Black in NYC (0.32 vs -0.10), and income-aligned items in LA (golf/tennis 0.37 vs 0.15, fine dining 0.35 vs 0.16).
* The data **do not** support a clean "raw is just population density" story. Raw per-item affinity already has the right sign in 30 of 36 tests and its CIs exclude zero about as often as corrected. The cell-level density `d` is only weakly related to these demographics (|rho| mostly < 0.1 apart from -0.24 against % Hispanic in LA and 0.31-0.35 vs. Korean/outdoor items in NYC), so raw is not density in the census sense; the correction removes a Qloo popularity/activity baseline, which is a different thing. Corrected beating raw in only 58% of tests (21/36) is modest and in NYC it is a coin flip (8/18).
* **Failures.** Luxury brands <-> income (the most obvious hypothesis) has the wrong sign after correction in both cities (LA -0.17, NYC -0.29; raw about 0), as does fast-food/McDonald's-Walmart <-> income in NYC for fast food (+0.12, wrong sign). Night clubs/cocktail bars <-> median age is ~0 (-0.05 in both). Morgan Wallen/Harley <-> % non-Hispanic white is ~0 after correction (0.01/0.05) while raw gets 0.26/0.27, i.e. the correction removed signal there. BTS <-> % Asian is weak for both (0.08-0.14). All Asian-cuisine items (Korean, Chinese/dim sum) and outdoor brands in NYC are better in raw than corrected. Likely reason: the baseline subtracts each cell's mean rank over the basket, and affluent or heavily Asian cells are high on many basket items at once, so subtracting that baseline also subtracts part of the true signal (luxury in rich cells is largely "everything is high there").
* Taken together: the correction helps most where a community's tastes differ sharply from the city-wide popularity pattern, and hurts where the true signal is itself a broad "high on everything" affluence/activity pattern.

**Limitations.** Ecological correlation (cell-level, says nothing about individuals). A tract contributes to exactly one cell via its internal point, though tracts straddle cells and cells straddle tracts; tracts in dense areas are small but in LA's periphery large. ACS tract estimates carry sizeable margins of error (especially Korean/Chinese detail and medians), which attenuates correlations for both methods; the Gazetteer/ACS 2023 vintage is not matched to when Qloo data was gathered. Qloo cells reflect where people go and where venues are (activity location), not where they live, which weakens residence-based census comparisons - commuter and tourist districts will mismatch. Pop >= 500 keeps only cells with residents, so downtown/commercial cells are excluded. Each hypothesis uses 1-3 basket items, so some depend on a single sparse series. 36 tests are not independent (LA and NYC share items; several hypotheses share variables), so counts like 21/36 should not be read as a precise significance test. Bootstrap CIs resample cells independently and ignore spatial autocorrelation, so they are too narrow.

## Known limitations
* Cell files: LA county has 4,770 cells; the exported file keeps the 3,478 within 18 km of a curated hood (2 dp) to stay under 2.5 MB. Vectors were computed on all cells.
* Basket `kind` includes `person` (comedians), which is not in the contract's kind list.
* Paris has only 926 geohash-6 cells (even with suburbs) and Mexico City 700 - coarser than LA/London.
