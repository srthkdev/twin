# Qloo probe findings (2026-10-11), LA

- Heatmap: ~1,000-1,800 geohash-6 cells (~1.2x0.6 km) for LA per query, ~2-4 s.
- RAW affinity ~= Qloo popularity (corr 0.97) -> raw heatmaps are an activity-density map.
- Lift = affinity - per-cell mean across a basket of entities reveals real cultural geography:
  Compton: Kendrick 98th pct; Boyle Heights: Bad Bunny 95 / Peso Pluma 92 / Korean 9;
  East LA: Peso Pluma 99 / Mexican 99 / Morgan Wallen 1; Silver Lake: Peso Pluma 5.
  Clusters: BadBunny~PesoPluma .54, Wallen~Taylor .47, Korean~Vegan .71.
  Misses: Koreatown Korean only 51st pct (baseline basket bias), Huntington Park BTS 96 (odd).
- Demographic signal reshapes heatmaps strongly (Kendrick <25 vs 55+: corr -0.62).
- signal.location.query + filter.type=artist gives hyper-local over-indexes
  (Boyle Heights: Las Cafeteras, Chicano Batman, Ozomatli, Felipe Esparza, Alice Bag).
- urn:demographics gives age/gender skews per entity. Brands cross-domain works.
- Explainability = just per-input weight split (~50/50), low information.
- filter.tags restaurant on places loosely respected (banquet halls, lodges returned).
- No-signal heatmap not allowed (needs >=1 signal) -> baseline must be built from a basket.

## Twin test LA -> Berlin (55-item basket, ~120 calls)
Corrected (rank -> minus cell mean -> z within city), cosine on 1.3 km neighbourhood means:
- Silver Lake -> Neukölln Reuterkiez .77, Kreuzberg SO36 .72 (worst Zehlendorf); shared: record stores, Tame Impala, Phoebe Bridgers, Frank Ocean, Peggy Gou, Aesop
- Echo Park / Highland Park -> Neukölln Reuterkiez .80/.84
- Bel Air -> Grunewald .59; Encino -> Charlottenburg/Zehlendorf; Boyle Heights -> Wedding .32
- Misses/meh: WeHo -> Mitte (not Schöneberg), Venice -> Tempelhof/Marzahn, Koreatown -> Charlottenburg
RAW ablation: every hood -> Mitte/Kreuzberg at cos ~1.00 (useless). Correction is what makes it work.
Coverage gap: 70% coverage filter drops Beverly Hills, Santa Monica, Compton, East LA, Pasadena; Berlin only 411/1245 cells kept.
