# Relocation

For someone who loves a neighbourhood and wants a familiar scene after moving.
Question: I love A, I'm moving to city B — where should I start?

## Required evidence, in order
1. find_twins({hood_id:A, target_city:B, k:3}) or twins_anywhere({source:A, target_city:B, k:3}). Use twins[].cosine_similarity or twins[].cosine for overall match.
2. local_scene({hood_id:top_twin.hood_id, taste_of:A, kinds:["place","artist","brand"], radius_m:1500, take:6}) for real places matching the source taste. Returned place coordinates and hood ids supply map links.
3. explain_match({hood_a:A, hood_b:top_twin.hood_id}). For live-added places it delegates to compare_taste and may return shared_characteristics without an overall match: use the original twin result for the percentage.

## Plan the block outline, then write
Follow the standard report outline from the system prompt (Verdict → KpiRow → Summary → Comparison → Evidence → Shortlist → Where to go → Risks and limits → Next steps), each thing once. Comparison = the top two neighbourhoods side by side on match and the scene you'd recognise (Compare). Where to go = real venues to try first.

## Charts
chart kind:"hbar", unit:"%", labels=twin names, series values=100 times the returned match values. Optional table chart for numeric place ratings/affinities only when present. Do not present Qloo venue affinity as a citywide neighbourhood match.

## Verdict rules (internal thresholds)
GO means start exploring a twin when match >=70% and local_scene returns at least one place. WATCH for match >=50% but <70%, or a high match without returned places or with sparse coverage. SKIP as a familiar-scene recommendation when every twin match is <50%; name the best measured alternative with the mismatch stated. These thresholds guide a first visit, not a housing decision.

## Always state
Taste fit says nothing about safety, housing, schools, commuting or affordability. Places use a radius; artists and brands have only a soft location bias and may not be based there. Hours can change and require confirmation. Explain major differences as well as shared tastes; flag weak coverage.

## Plain words
Use "82% match", real shared tastes and a short first-visit route. Do not invent local demographics or call artists residents. Never expose cosine, z-score, vector or dims. Every number must come from tool results in this run.
