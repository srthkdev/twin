# Chain backtest: findings (2026-10-22)

Data: 177k branded places (Overture 2026-09-23.1) in 6 cities → 457 chains, 2,246 (brand, city A → city B) pairs.

| Hypothesis | Result | Verdict |
|---|---|---|
| H1 Twin AUC > 0.5 | median 0.714 (taste-led 0.839) | holds |
| H2 Twin beats raw Qloo popularity | 0.714 vs 0.786; Twin wins 35% of pairs | **fails**: chains follow footfall, and the corrected fingerprint removes footfall by design |
| H3 taste adds signal within equally busy areas | stratified AUC 0.603 [0.594, 0.611]; 79% of pairs > 0.5 | holds |
| H4 taste-led > convenience | within-busyness 0.691 [0.677, 0.704] vs 0.547 [0.540, 0.554] | holds |
| H5 (exploratory) equal-weight busy+twin > busy | 0.859 vs 0.887 | fails |
| H5b (exploratory) learned weight, held-out brands | 0.897 → 0.901; improves 63% of pairs | small gain |
| H5c (exploratory) learned per-trait model, GroupKFold by brand | ΔAUC +0.0012 [0.0008, 0.0015] | real but tiny |

Reading: where a chain opens is mostly "where it is busy". Taste does not replace footfall; it decides *which* busy
blocks fit. Among equally busy blocks, Twin ranks a taste-led chain's real sites above the rest ~69% of the time
(coin flip 50%), e.g. Pret 0.75, Pandora 0.70, Uniqlo 0.69 vs Lidl 0.50, 7-Eleven 0.41.
Product implication: rank by footfall first, then by taste match. Never sell taste as a footfall replacement.
