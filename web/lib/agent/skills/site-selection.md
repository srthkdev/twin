# Site selection

For founders, operators and property teams deciding where to open a concept.
Question: Where should I open X in city C?

## Required evidence, in order
1. opportunity({city:C, taste:X, taste_is:"place_type"}). For an artist/brand-led concept use taste_is:"entity" and supply_kind set to the actual venue kind. Otherwise omit supply_kind to infer it; retain the returned supply_kind and taste (which may be broader than X). Read busy_pct and busy_tier for each candidate: screen for busyness before taste demand and competition. Quiet candidates can appear when fewer than three active/busy candidates remain.
2. venue_supply({lat:site.lat, lon:site.lon, radius_m:1000, kinds:[supply_kind]}) on the leading two returned top_opportunities. Use the returned coordinates, never invented ones. Counts are in counts[kind], or kinds[].count for live OpenStreetMap. Keep the radius identical. These radius counts are different from opportunity's cell supply.
3. local_scene({hood_id:"<leading site's place name>, <C>", kinds:["place"], place_type:X, radius_m:1000, take:6}) for real neighbouring venues, addresses and returned coordinates.
4. Scene fit, the step most screens skip: call scene on the neighbourhood of each of the leading two or three candidates (the place name plus C). A single tag such as "wine bar" can over-index in places whose wider taste does not match the concept (affluent suburbs for wine, for example). Keep a candidate on top only if its scene shares the concept's world (music, food, nightlife, fashion or lifestyle signals that a customer of X would recognise); name those shared tastes from the scene result. Demote candidates whose scene clashes and say why in one line.
5. where_in_city({city:C, item_or_group:X, k:5}) to check the broader demand pattern. Use corrected_z where returned; cells_in_top30 on live-city top_hoods is a concentration count, not a demand score.

## Plan the block outline, then write
Verdict → KpiRow → Heading → Paragraph → Chart → Ranking (each item's reason names its busyness, demand and scene fit) → Heading → Paragraph → Chart → Places → Callout → NextSteps. Omit a second chart or Places only if the evidence cannot support them. Use 5–24 blocks, at most 4 Chart blocks.

## Charts
Call chart with kind:"hbar" for the two checked locations' venue counts from venue_supply, unit:"venues". Label the radius in the caption. Optionally chart kind:"scatter", with x=top_opportunities[].supply and y=top_opportunities[].demand; these are same-cell measurements from opportunity. Describe the y axis as relative demand, never a percentage. Do not mix cell and radius supply. Do not chart a computed city median: the tools do not return one.

## Verdict rules (internal thresholds)
GO means shortlist for a site visit, never permission to sign a lease. GO requires a scene that fits the concept (step 4), busy_tier "active" or "busy", opportunity demand >=1, score >=1, cell supply no greater than venues_counted/cells_scored, and radius count no greater than the other checked site. A "quiet" site is at most WATCH even with strong taste demand: explain that the chain backtest found openings follow busy areas, with taste helping choose among equally busy blocks. WATCH also when demand >0.5 but the other conditions fail, the broader where_in_city result differs, or busyness/supply/scene evidence is missing. SKIP when no returned opportunity has demand >0.5. These are screening heuristics. Derive comparisons internally; do not publish computed averages or thresholds as measured facts unless separately returned by a tool.

## Always state
Open map counts are a lower bound, not a complete competitor census. Explain when niche demand was replaced by a broader taste. Cell and radius counts cover different areas. Busyness is relative venue density, with popularity as a fallback; it is not measured pedestrian footfall. Taste demand cannot establish revenue, footfall, rent, permits or a viable lease. Missing supply is unknown, not zero.

## Plain words
Say "strong demand", "existing venues" and "worth a site visit". Show only measured numbers. Link places with returned hood ids or venue/site coordinates. Do not expose cosine, z-score, vector or dims. Finish with concrete validation actions.
