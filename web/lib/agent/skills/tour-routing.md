# Tour routing

For artists, managers and promoters shortlisting cities and venues.
Question: Where should artist Z play?

## Required evidence, in order
1. tour({artist:Z, cities:[...user_named_cities]}). Omit cities only if the user asked for an open scan: it scans up to six already fingerprinted cities. Inspect each cities[] row for error, fan_signal_cells, reach (0–1), top_cell_affinity, strongest_neighbourhoods and venues_near_strongest. Failed cities are unknown, not weak markets.
2. trend({item:Z, months:6}) for points[].date/percentile and change_in_percentile/direction. Respect trackable:false or missing data.
3. audience({item_label:Z}) for age_bands_sorted[].skew and gender[].skew. These are deviations from a baseline, not audience sizes or shares.

## Evidence for the standard sections (after the playbook's own steps; run independent calls in parallel)
- Who the customers are: audience({item_label:"<a brand, artist or place type that defines the concept>"}) for age bands; local_scene on the lead candidate (kinds ["artist","brand"]) for what they love.
- Competition: local_scene on the lead candidate with place_type set to the concept, to name real competitors with addresses.
- Benchmark abroad: find_twins (built-in cities) or twins_anywhere({source:"<lead candidate>", target_city:"<another fingerprinted city>"}) — say where this taste already works and what that implies.

## Plan the block outline, then write
Follow the standard report outline from the system prompt (Verdict → KpiRow → Summary → The market → Who the customers are → Candidates compared → Demand → Competition → Benchmark abroad → Scorecard → Places → Risk → Caveat → Validation plan), each thing once. Comparison = the cities side by side on fan signal, momentum and audience (Table). Shortlist = cities in play order with the room to book. Places may be added only after geocode({query:"<returned venue and city>"}) supplies real coordinates; tour venues themselves do not return map coordinates.

## Charts
First chart: hbar, unit:"%", reach multiplied by 100 per successful tour city; call it "Where a fan signal appears" and explain it is share of sampled map cells, not population or ticket buyers. Second: line with trend.points dates and their raw percentile values (no invented rescaling), caption "relative popularity over time". Optional third chart shows audience skew as a relative measure, never percentages or headcounts. Use returned numbers only; tour's ranking product is not an available measured field.

## Verdict rules (internal thresholds)
GO means approach promoters when a city's reach >=0.25, fan_signal_cells >=50, venues_near_strongest is nonempty, and trend.direction is rising or flat. WATCH when reach >=0.10 or a promising city lacks venues/trend/audience evidence; a fading trend also caps the verdict at WATCH. SKIP a city for this shortlist when reach <0.10 and fan_signal_cells <20. Use WATCH for mixed weak results or unavailable cities. Never turn these heuristics into revenue or attendance forecasts. Audience is context and cannot independently veto a city.

## Always state
Reach is geographic coverage, not people or ticket sales. Local strength is relative to each city. Shortlisted venues have unverified availability, capacities, fees and booking interest. Trending is historical; it does not promise future growth. Audience skews are neither local resident demographics nor proportions. The city list is not a travel-optimized itinerary; routing costs, visas and dates need separate checks.

## Plain words
Say "fan signal", "stronger recent interest" and "venues to contact". Avoid cosine, z-score, vector, dims and unexplained percentiles in public prose. Keep exact dates on charts; use years only or written month names in narrative when date components are not numeric tool fields.
