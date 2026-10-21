# City comparison

For someone choosing between two cities or comparing their cultural scenes.
Question: Compare A and B.

## Required evidence, in order
1. compare_taste({a:A, b:B}) for shared_characteristics[].name/score; when A and B are specific neighbourhoods use explain_match({hood_a:A, hood_b:B}) instead. City names may not resolve to neighbourhood artist signals: if compare_taste cannot resolve either city, collect both scene results, then compare_taste({a:"<up to five returned artists/brands for A, comma separated>", b:"<up to five returned artists/brands for B, comma separated>"}). State this narrower taste-sample comparison. Never silently substitute a neighbourhood for an entire city.
2. venue_supply({place:A, radius_m:1000}) and venue_supply({place:B, radius_m:1000}) to discover common venue kinds. Then call both again with kinds:[...the_same_up_to_six_returned_kinds] and radius_m:1000. Absent keys in the default top-kind lists are not zero. For cities, these are areas around the returned geocoded centres, not whole-city totals. Prefer lat/lon from geocode({query:A}) and geocode({query:B}) if a particular district or centre must be made explicit.
3. scene({place:A}) and scene({place:B}) for place_types, audiences, artists and brands. Reuse same-run results gathered for the fallback in step one.

## Plan the block outline, then write
Verdict → KpiRow → Heading → Paragraph → Compare → Chart → Heading → Paragraph → Table → Callout → NextSteps. Omit KpiRow if it would overstate partial coverage; use 5–24 blocks.

## Charts
chart kind:"bar", unit:"venues", labels=the same explicitly checked kinds, series=the two venue_supply counts maps or kinds[].count results. Caption the radius and the exact areas sampled. Optional hbar of shared_characteristics[].score uses "shared taste strength", no percent unit. Only an actual explain_match.cosine_similarity supports an overall percentage; shared-characteristic scores do not.

## Verdict rules (internal thresholds)
INFO for an open comparison with no stated preference. If the user supplies a particular venue kind as a decision criterion, GO means visit the option with at least 3 counted venues of that kind and a strictly higher count than the other sampled area, with scene showing the requested taste. WATCH for tied counts, fewer than 3 venues, mixed preferences, missing coverage or unmatched scene evidence. SKIP an option only when that explicit kind is 0 there, at least 3 in the other checked area, and the user's decision depends on that kind. These rules select an area to explore, not a winning city on all dimensions. Use INFO if no winner is supported by the user's criteria.

## Always state
Centre-radius samples do not describe entire cities. Counts are lower bounds; do not assert city totals, a city median, cost, safety or population. Shared characteristics do not mean identical audiences. Explain missing comparisons and mismatched source coverage. No invented overall "city match" from unrelated metrics.

## Plain words
Compare the same concrete measures side by side. Say "more venues counted in this area" and name shared tastes. Never show cosine, z-score, vector or dims. Keep public numbers grounded in this run; link the actual sampled areas.
