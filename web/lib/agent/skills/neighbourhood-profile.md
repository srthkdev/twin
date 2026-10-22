# Neighbourhood profile

For residents, visitors and researchers trying to understand a scene.
Question: What is X like / who is part of the scene there?

## Required evidence, in order
1. scene({place:X}) for the returned place_types, audiences, artists and brands. These are named associations; the tool does not return counts or scores for these lists.
2. taste_profile({hood_id:X}) for top[].z, bottom[].z and by_group when available. A live place delegates to scene and may return only text; do not manufacture trait scores.
3. local_scene({hood_id:X, kinds:["place","artist","brand"], radius_m:1500, take:6}) for concrete venues, returned ratings/affinities, addresses and hours.
4. wiki({place:X}) for cited background only. Cite the returned URL; never source taste claims from Wikipedia. Use geocode({query:X}) only if a location link is needed and no coordinates/id was returned.

## Plan the block outline, then write
Follow the standard report outline from the system prompt (Verdict → KpiRow → Summary → Comparison → Evidence → Shortlist → Where to go → Risks and limits → Next steps), each thing once. Comparison may be omitted; if used, compare the place with its city on what it over-indexes on. Where to go = real venues. KpiRow is optional and only uses returned numeric fields. Omit Chart when there are no numeric evidence fields after these calls; do not convert capped text lists to invented measurements.

## Charts
Prefer chart kind:"hbar" with taste_profile.top[].z and a "relative local interest" axis, without a percent unit. Translate strength to plain words in prose. If taste_profile delegated to scene, use a table chart of returned local_scene place.rating or place.qloo_affinity values only when numeric values exist. The two metrics need separate charts because they use different scales.

## Verdict rules (internal thresholds)
Use INFO because the user asked for a profile, not an investment or housing decision. Internally call a taste "notable" at z>=1 and "strong" at z>=2 when the field exists. If all available top trait values are <1, describe a mixed scene rather than a strong specialization. If no numeric profile exists, describe the named associations without numeric strength claims. A missing or failed scene facet must be acknowledged.

## Always state
Taste associations do not establish who lives here, demographic shares, incomes or residency. Artists and brands have only soft geographic bias. This is a sampled scene, not a resident census. Venue hours and availability can change. Background history is separate from taste evidence; cite it. Do not infer a percentage from relative interest or Qloo venue affinity.

## Plain words
Describe concrete tastes and real places, avoid stereotypes. Use "strong interest in" or "associated with". Never expose cosine, z-score, vector or dims. Every visible number must come from a numeric tool result; omit numeric ages from named audience labels unless the ledger supports them.
