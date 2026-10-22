# Expansion

For an operator with a working concept who wants a similar audience in another city.
Question: My concept works in neighbourhood A — where is A's twin in city B and is it crowded?

## Required evidence, in order
1. find_twins({hood_id:A, target_city:B, k:3}); or twins_anywhere({source:A, target_city:B, k:3}) when working with a live-added city. Resolve ambiguity with search_hoods({query:A}) if needed. Match comes from twins[].cosine_similarity or twins[].cosine; multiply by 100 only to show a percentage.
2. venue_supply({place:"<A with city>", radius_m:1000, kinds:[concept_kind]}) and the same call for the leading two target twins, using their names with B. If the concept kind is unspecified, first request venue_supply without kinds to identify observed kinds; never assume the concept from a neighbourhood name. Compare counts[kind] or kinds[].count with identical radii. Read each target's busy.tier: active/busy sites come first, then taste fit, then competition. If checking particular blocks, opportunity({city:B, taste:concept_kind, supply_kind:concept_kind}) returns busy_pct and busy_tier for those sites.
3. local_scene({hood_id:top_twin.hood_id, taste_of:A, kinds:["place"], place_type:concept_kind, radius_m:1000, take:6}). Omit place_type if the concept is still unknown.
4. compare_taste({a:A, b:top_twin.hood_id}) for shared_characteristics[].name/score. These scores describe shared characteristics, not overall neighbourhood match.

## Evidence for the standard sections (after the playbook's own steps; run independent calls in parallel)
- Who the customers are: audience({item_label:"<a brand, artist or place type that defines the concept>"}) for age bands; local_scene on the lead candidate (kinds ["artist","brand"]) for what they love.
- Competition: local_scene on the lead candidate with place_type set to the concept, to name real competitors with addresses.
- Benchmark abroad: find_twins (built-in cities) or twins_anywhere({source:"<lead candidate>", target_city:"<another fingerprinted city>"}) — say where this taste already works and what that implies.

## Plan the block outline, then write
Follow the standard report outline from the system prompt (Verdict → KpiRow → Summary → The market → Who the customers are → Candidates compared → Demand → Competition → Benchmark abroad → Scorecard → Places → Risk → Caveat → Validation plan), each thing once. Comparison = the home neighbourhood against its best twin in the target city on match, existing venues and scene (Compare). Shortlist = twins ranked by fit.

## Charts
chart({kind:"hbar", unit:"%", ...}) for the returned twin match percentages. A second bar chart may compare same-kind supply counts for the home and checked twins from venue_supply, unit:"venues"; caption the common radius and data sources. Reference only returned chart ids in Chart blocks.

## Verdict rules (internal thresholds)
GO means investigate expansion when a twin's checked site is "active" or "busy", match >=70%, observed same-kind supply is below the home neighbourhood's count, and local_scene returns at least one relevant place. "Quiet" means at most WATCH: explain that the chain backtest found openings follow busy areas, with taste helping choose among equally busy blocks. WATCH also for match >=50% but below 70%, supply equal to/above home, zero home supply, unknown concept, or missing busyness/other evidence. SKIP if all returned matches are below 50%. No city median is available; say "less crowded than the home neighbourhood in the sampled area", never "below the city median". Do not claim the concept itself has succeeded without the user's evidence.

## Always state
Taste similarity does not predict sales or margins. Counts are a lower bound and venue categories can be broad. Busyness is relative venue density with a popularity fallback, not measured pedestrian footfall. Equal radii can span different urban forms. Mention coarse coverage and different city baskets when returned. Check rents, capacity, regulation and competitor quality before committing.

## Plain words
Use "82% match", "fewer existing venues" and concrete shared tastes. Never show cosine, z-score, vector or dims. Keep every displayed number tied to this run's tools; link returned places and state the unanswered commercial questions.
