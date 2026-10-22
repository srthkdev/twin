# Gap scan

For local operators and researchers looking for concepts to investigate.
Question: What thrives in this neighbourhood's twins abroad but is missing here?

## Required evidence, in order
1. gap_scan({home, cities:[...user_named_cities], twins:3, radius_m:1000}) is the main evidence. Omit cities when none were named: it scans already fingerprinted cities without building new ones. Home accepts a neighbourhood id/name or place/address. Use returned home, twins, gaps and present_everywhere. Each gap includes home_count, twin_counts, home_share_pct, twin_shares_pct, twin_mean_share_pct and lift. Twin counts/shares follow the returned twins order. The top twins can be in the same city; name the actual cities and flag a single-city or single-twin comparison.
2. Optionally check the leading gap's local demand with where_in_city({city:home.city, item_or_group:gap.kind}) or opportunity({city:home.city, taste:gap.kind, supply_kind:gap.kind}). Use opportunity's busy_tier if recommending a particular site. A supply gap alone does not establish demand.
3. Optionally confirm explicit counts with venue_supply at the returned places using radius_m from gap_scan and kinds:[...candidate_kinds], up to six kinds per call. A missing/error key is unknown, not zero. Keep radius counts separate from opportunity's cell counts.
4. Optionally use scene({place:"<home with city>"}) and scene({place:"<best matched twin with city>"}) for taste context. Its capped lists cannot establish supply.

## Plan the block outline, then write
Follow the standard report outline from the system prompt (Verdict → KpiRow → Summary → Comparison → Evidence → Shortlist → Where to go → Risks and limits → Next steps), each thing once. Comparison = a Table of the gap kinds: home count vs each twin's count. Shortlist = the gaps ranked by lift, each with where in the city demand for it sits. Use a separate row for each measured kind and place; explain what is missing and what remains uncertain.

## Charts
Use chart kind:"bar", unit:"%", labels=returned gap kinds, and series for home_share_pct and twin_mean_share_pct; caption these as shares of counted venues, not demand. A second chart can show home_count and twin_counts with unit:"venues", at most three places per chart. Optional hbar uses twins[].match_pct and unit:"%". Use returned numbers directly, including present_everywhere for context. Never chart null lift or invent a finite lift when none were counted at home. No counts of scene's text lists.

## Verdict rules (internal thresholds)
The tool returns gaps supported by all twins or at least two thirds: each supporting twin has >=3 venues and a share >=1.5 times home's, while home has <=1 venue or less than half the twins' mean share. GO means a concept worth testing when a returned gap has at least two supporting twins with match >=70%. WATCH for one observed twin, lower matches, a single-city comparison, or incomplete evidence. SKIP when no gap is returned with complete coverage, or all matches are <50%. Compare shares rather than raw counts across cities. The report verdict follows the strongest supported candidate; missing evidence means WATCH. Presence cannot prove a concept thrives: describe a recurring supply pattern, not profitability. Thresholds are internal heuristics, not additional observations.

## Always state
Zero in open maps means none counted, not proof none exist. Counts are lower bounds from map cells whose centres fall inside the radius. Shares use all measured kinds except the overlapping generic bar and restaurant rollups; they are not shares of every business. Demand, business survival and spending are unmeasured by this comparison. A zero home share has no finite lift. Mention a single-city comparison and thin coverage.

## Plain words
Say "present in the twins, none counted here", "a concept to test" and "similar crowd". Use only tool numbers; do not invent a gap score or show cosine, z-score, vector or dims. Recommend a street check and customer interviews.
