# Chain backtest: pre-registered before any result was computed (2026-10-22)

Question: from where a chain trades in city A, can Twin's taste fingerprints predict where it trades in city B?

Setup
- Sites: Overture Maps Places 2026-09-23.1, `brand.names.primary`, open places only, snapped to Twin's geohash-6 cells.
- Pairs: every (brand, A, B) with >= 5 site-cells in both A and B, A != B.
- Twin score: cosine between the mean 116-trait corrected fingerprint of the brand's A cells and each B cell.
  Basket items naming the brand itself are dropped (no leakage, e.g. Starbucks).
- Label: B cell has >= 1 site of the brand.
- Metrics: ROC AUC per pair; recall of site-cells in the top 10% of ranked B cells.
- Baselines: random (AUC 0.5); BUSY = number of branded places in the cell (where chains cluster anyway);
  RAW = Qloo raw popularity of the cell (`d`).

Hypotheses
- H1: median Twin AUC > 0.5 across pairs.
- H2: Twin beats RAW on the median pair.
- H3 (the hard one): within busyness deciles (stratified AUC), Twin is still > 0.5, i.e. taste adds information beyond "chains go where it is busy".
- H4: taste-led brands (cafés, fashion, beauty, books) score higher than convenience brands (supermarkets, fast food, banks, pharmacies, fuel).

## Exploratory (added after seeing H1–H4; not pre-registered)
- H5: busyness + Twin (z-scored log busyness + z-scored Twin cosine, equal weights, no tuning) beats busyness alone.
