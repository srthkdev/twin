# Twin: every neighbourhood has a twin

Twin finds the cultural twin of a neighbourhood in another city, such as the Silver Lake of Berlin or the Williamsburg of London. It works from Qloo taste data. An agent then helps you act on the answer: where to go, who you'd find there, and what they're into.

This is the full story of how we got there, including the ideas we dropped and the tests we lost.

![Twin explore: Silver Lake to Berlin](/media/twin-explore.gif)

## Inspiration

We started with the hackathon's own test: *if your submission would work the same without Qloo, you're building the wrong thing.* So before picking an idea, we spent a day finding out what Qloo's API can do that a language model can't.

We dropped several ideas on the way:

- **A sync-licensing agent.** It would pick ad music by audience. The demo was strong, but the core question was too narrow to test.
- **A simulated city of 20,000 taste-driven agents.** It would have looked spectacular. But Qloo returns averages for groups, not data on individuals. The spread dynamics would have been our assumptions dressed up as data.
- **"UNDO", a provenance layer for agent memory.** It came from a real effect we observed: feed a recommendation back in as an interest and the profile drifts. Radiohead → Patagonia → The Lumineers. The idea was solid, but it would work the same on any recommender, which fails the test above.

What survived came from the data itself.

## What we found in the API

**Heatmaps are detailed.** One heatmap query for Los Angeles returns about 1,600 geohash-6 cells, each roughly 1.2 × 0.6 km. That's neighbourhood-level resolution.

**Raw affinity is mostly popularity.** Across LA cells, raw affinity correlated **0.97** with Qloo's own popularity score. The Kendrick Lamar map and the Korean-restaurant map were 0.75 correlated. Busy cells score high for everything, so Compton, Kendrick's hometown, sat at the 64th percentile for him.

**The signal is there underneath.** We subtracted each cell's mean over a basket of items, and recognisable geography came back:

| Neighbourhood | What stood out after correction |
|---|---|
| Compton | Kendrick Lamar, 98th percentile |
| Boyle Heights | Bad Bunny 95th, Peso Pluma 92nd, Taylor Swift 5th |
| East LA | Peso Pluma 99th, Morgan Wallen 1st |
| Silver Lake | Korean food 75th, vegan 69th, Peso Pluma 5th |

The corrected maps also grouped items the way you'd expect. Bad Bunny went with Peso Pluma (0.54), and Morgan Wallen with Taylor Swift (0.47).

**Other things we learned about the API:**
- **Per-location affinity saturates.** Asking Qloo directly for basket artists near a point returned 1.0 for nearly every artist, in both Silver Lake and Beverly Hills.
- **Explainability weights are uninformative.** They split almost exactly 50/50 between inputs.
- **The best use of location is "what over-indexes here".** For Boyle Heights it returned Las Cafeteras, Chicano Batman, Ozomatli, Alice Bag and Felipe Esparza. An LLM would have answered with stereotypes.

## What it does

![raw vs corrected](/media/raw-vs-corrected.gif)

- **Explore.** Pick a neighbourhood and every block of its city lights up by how similar it is. Pick another city and the camera flies there. Its blocks rise by similarity to your source, and the five closest neighbourhoods are ranked. A *shared / different* table shows the traits behind each match. A raw/corrected toggle shows the same map before and after our fix.
- **Drop a pin.** Click any block to use that exact cell as the source, not just a named neighbourhood.
- **Read a block.** Each ~1 km block is one column. Its height is how much it's like your source, and its colour is what it's mostly about: sound (amber), table (bone) or scene (rust). Hover it for the likeness, the taste mix, its strongest traits and how many venues of each kind actually stand there (Overture). Hit *ask* and the agent answers about that exact block.
- **Any city on Earth.** Twin isn't limited to the six cities we precomputed. Ask about Lisbon or Madrid and the agent fingerprints the city live: about 40 Qloo heatmaps, the same correction, neighbourhoods from OpenStreetMap. The result is cached, so the second visitor gets it instantly.
- **An agent with 23 tools,** in a tab beside the map. It streams its work as a timeline: each step shows its source (QLOO, TWIN, OVERTURE, OSM, WIKI, WEB), live progress and how long it took. Once the answer lands, the steps fold into one line. Answers are written for people, not analysts: a bold one-line verdict, a few reasons in plain words, "% match" instead of cosines. Every neighbourhood and venue in the answer is a link that flies the map there. Web facts are cited inline, and two follow-up questions are one click away. It's a real conversation: follow-ups like "and its twin in Paris?" keep the context, and the chat survives reloads.
- **Opportunity map.** "Where should I open a wine bar in Berlin?" compares Qloo *demand* for the taste in every cell with *supply*, meaning how many such venues physically exist (Overture Maps Places). The gaps are painted on the map.
- **Tour planner.** Where an artist's fans actually are in each city, the strongest neighbourhoods, and Qloo live-music venues nearby.
- **Briefs.** On request, the agent packages findings as a downloadable markdown brief.
- **MCP server.** The same tools run over stdio, so Twin works inside Claude Code, Codex or any MCP client.

### Who answers what

We kept one rule: **Qloo makes every taste decision, and the other sources only do jobs Qloo can't.**

| Question | Source |
|---|---|
| Twins, vibe, venue picks (with hours and price), audiences, brands, momentum, demand | Qloo (live) and Twin's corrected fingerprints |
| How many venues of a kind physically exist | Overture Maps Places, precomputed per city |
| Neighbourhood boundaries for a new city, coordinates | OpenStreetMap (Overpass, Nominatim) |
| Background facts, population | Wikipedia and Wikidata |
| This week's events, news, closures, rents | Web search (Tavily), always cited |

### Things to try

- *Find the Silver Lake of Berlin.*
- *I love Silver Lake. I'm moving to Neukölln — where do I actually go?*
- *Where in Berlin should I open a natural wine bar?*
- *Plan a 3-city European tour for Peso Pluma.*
- *What's the vibe of Shimokitazawa, Tokyo?*
- *Find the Shoreditch of Lisbon.*

![agent answering with live Qloo venues](/media/agent.jpg)

## How we built it

![method](/media/method-stack.gif)

1. **Sample.** One Qloo heatmap per basket item, per city. The basket has 116 items: artists, brands, films and place types. We picked them to span affluence, creative scenes, immigrant communities, queer nightlife, sport and suburban life. 1,041 live Qloo calls in total, every response cached.
2. **Correct.** Percentile-rank each item across the city's cells. Subtract each cell's mean rank over the basket, which is its popularity baseline. Z-score each item within the city.
3. **Fingerprint.** A neighbourhood is the mean of the cell vectors within 1.3 km of its centroid. We have 139 neighbourhoods across LA, New York, London, Berlin, Mexico City and Paris.
4. **Match.** Cosine similarity, top five per city, with shared and diverging traits.

**Stack:**
- **Pipeline:** Python, standard library only.
- **App:** Next.js with MapLibre's globe projection and deck.gl columns for the city blocks.
- **Agent:** Vercel AI SDK. Server: `streamText` with tools, and `createUIMessageStream` so tool progress and map actions stream as data parts. Client: `useChat`.
- **Models:** free open-weight models through OpenRouter, with OpenRouter's native fallback: MiniMax M3.1 Flash, then NVIDIA Nemotron 3 Ultra, then Thinking Machines Inkling.
- **Caching:** every Qloo, OpenStreetMap, Wikipedia and search response, and every live city, goes to Vercel Blob. Repeat questions cost nothing, which matters on free tiers.
- **Supply data:** Overture Maps Places, queried with DuckDB straight from its cloud bucket and binned into the same 1 km cells. It's precomputed per city, so opportunity answers are instant.

**City queries had quirks we had to work around:**
- "Los Angeles" returns only the City of LA, so Compton and Santa Monica were missing. We use "Los Angeles County".
- "New York" returns the whole state at coarse resolution. We use "New York City".
- "Paris" returns only the 20 arrondissements. We use "Paris and suburbs".
- Mexico City and Paris come back at geohash-7, so we average them up to geohash-6.

## How we tested it

We wrote down every label before computing any result, and committed it to git first. The ground-truth pairs are in commit `edf9056` and the census hypotheses in `4965b70`.

### 1. Does the correction separate places?

Mean cosine between neighbourhoods in different cities is **0.95** on raw scores and **0.16** after correction. The average gap between a city's best and worst match grows from 0.11 to 0.73.

### 2. Does the corrected map match the census?

We pre-registered 18 hypotheses and ran each in LA and NYC, so 36 tests. Each one links a taste item to an ACS 2023 tract variable, with an expected direction: Latin artists ↔ % Hispanic, soul food ↔ % Black, luxury brands ↔ income, and so on. We joined tracts to cells and computed Spearman ρ.

| | Corrected | Raw |
|---|---|---|
| Correct sign | 32 / 36 | 30 / 36 |
| Mean \|ρ\| | 0.29 | 0.22 |
| Corrected beats raw | 21 / 36 | |

![census check](/media/evals-census.jpg)

**Where the correction helps:**
- Latin artists ↔ % Hispanic in LA: **0.29 → 0.64**.
- Soul food ↔ % Black in NYC: **0.29 → 0.67**.
- Real Madrid and Barcelona ↔ % Hispanic in LA: −0.04 → 0.41.

**Where it hurts:**
- Luxury brands ↔ income turns negative in both cities (LA −0.17, NYC −0.29).
- Country music and Harley-Davidson ↔ % non-Hispanic white drops from 0.26 to 0.01.
- Rich areas over-index on many items at once, so subtracting the baseline removes some of what they share.

One surprise is good news for Qloo: **raw data already gets the direction right in 30 of 36 tests**. Raw isn't "just density" in the census sense. It carries a popularity baseline on top of real signal.

### 3. Does Twin find the twins people already name?

We collected 31 published comparisons ("Shoreditch is London's Williamsburg"), each with a source URL and quote. We split them into 10 dev and 21 test pairs and scored ranks in both directions. The LLM baseline got the same candidate list, with no data.

| Method (test, n = 42) | hit@1 | hit@3 | MRR |
|---|---|---|---|
| LLM only (Claude, no data) | 0.52 | 0.74 | **0.67** |
| Raw Qloo | 0.21 | 0.41 | 0.38 |
| Twin | 0.12 | 0.45 | 0.34 |
| Random | 0.04 | 0.12 | 0.16 |

**The LLM wins.** It has read the same blogs the labels come from, so this test mostly measures recall. Twin gets roughly three times random from taste data alone, with no names and no text.

**Things we tried, without tuning on test:**
- **Blending Twin's ranking with the LLM's.** It was slightly better on dev (MRR 0.72 vs 0.69) but worse on test (0.55 vs 0.65). We dropped it.
- **Mixing raw features back in.** Worse on dev.
- **Qloo's per-location scores.** They saturate, as noted above.
- **A held-out-trait check.** We matched neighbourhoods on half the basket and scored them on the other half. Twin's picks agreed 0.51, the LLM's picks 0.47, the published twins 0.47, random 0.27. That check lives in Qloo's own space, so it's partly circular, and we report it as weak evidence only.

### Sanity checks

The correction does what it should on negatives. Silver Lake for Peso Pluma drops from the 45th to the 5th percentile, and East LA for Morgan Wallen from 54th to 25th. Compton for Kendrick Lamar rises from 83rd to 99th.

But it also **compresses some true positives** that raw data had already maxed out:
- Koreatown for Korean food: 98th → 70th.
- Mayfair for Rolex: 99th → 66th.
- Le Marais for gay bars: 98th → 64th.

That's the same trade-off the census check found.

### 4. Building the agent

We started with a hand-written tool loop running on the local Codex CLI. We moved to the AI SDK because it streams properly: text, reasoning and tool parts each get their own state, so the timeline UI could show real progress instead of a spinner.

**Picking the model.** We compared the free models on our own agent questions and on Artificial Analysis's Intelligence Index (v4.3.2):
- **MiniMax M3.1 Flash** (index 43) chose the right tools every time and made real live Qloo calls.
- **Nemotron 3 Ultra** (index 23) answered with fewer tools and no live calls.
- **Inkling's free endpoint** failed every request during our test.

So MiniMax leads, with the others as automatic fallbacks.

**Making it fast.** The first version took **135 s** to answer "find the Silver Lake of Berlin": the model reasoned at length and volunteered extra steps. Two changes fixed it: low reasoning effort for tool-heavy turns, and a playbook prompt with a recipe and tool budget per task type. The same question now takes **10 s and one tool call**.

| Task | Time | Tools | Live Qloo calls |
|---|---|---|---|
| Find the Silver Lake of Berlin | 10 s | find_twins | 0 |
| Moving from Silver Lake to Neukölln, where to go | 26 s | find_twins, local_scene ×4 | 11 |
| Where to open a natural wine bar in Berlin | 57 s | opportunity, where_in_city, local_scene, venue_supply | 16 |
| 3-city European tour for Peso Pluma | 13 s | tour, trend | 1 |
| Vibe of Shimokitazawa, Tokyo | 10 s | scene, wiki | 4 |
| Shoreditch of Lisbon | 12 s | list_cities, twins_anywhere | 0 |

**What broke, and how we fixed it:**
- **Public Overpass servers timed out or returned 502** for most of a day. So venue supply now comes from Overture, precomputed per city; Overpass is only the fallback for brand-new cities.
- **"Natural wine" is a Qloo tag with almost no heatmap data.** Opportunity now falls back to the venue type itself (wine bar) and says so.
- **An early tour run fingerprinted Madrid unprompted,** which cost 40 Qloo calls. The prompt now only allows `add_city` when the user names a city.
- **Early answers read like a lab report** — z-scores, cosines, raw coordinates. The prompt now bans them from the visible text. Coordinates go into `geo:` links that the UI turns into map buttons, and the result cards carry the numbers.
- **Stopping a run mid-tool broke the next question,** because history held a tool call with no result. The route now drops unfinished tool calls and old reasoning from history, and the last step is forced to be an answer, never another tool call.

## Challenges

- **Proving Qloo was necessary.** Our first headline claim, "Twin beats an LLM at finding twins", turned out to be false. Instead of hiding it we changed the product's story. The LLM reasons and talks; Qloo supplies measured, fine-grained taste that the LLM doesn't have. The agent uses both, and the evals page shows the loss.
- **Measuring without circularity.** Checking Qloo-built fingerprints against Qloo heatmaps proves very little. The census check and the published pairs are both outside Qloo.
- **Getting enough data.** Getting comparable data for six cities took 1,041 calls, plus caching and the query workarounds described above.

## What we learned

- Raw taste data is a popularity map with signal underneath. You have to subtract the crowd before comparing places.
- On famous questions, an LLM's memory beats data. Data matters for the long tail: the block nobody has written about, or the pin you drop yourself.
- Pre-registering labels made the bad results easy to accept. We couldn't argue our way around them.

## What's next

- Fix the affluence blind spot by adding a separate wealth axis instead of subtracting it away.
- Add more cities, and test against foot-traffic data instead of residence data.
- Let the agent plan more than a first afternoon: a move, a tour stop, a store opening.

## Built with

Qloo Insights API (heatmaps, location insights, audiences, demographics, compare, trending, search, tags) · Vercel AI SDK · OpenRouter (MiniMax M3.1 Flash, Nemotron 3 Ultra, Inkling) · Vercel Blob · Overture Maps Places · DuckDB · OpenStreetMap (Nominatim, Overpass) · Wikipedia / Wikidata · Tavily · Python · Next.js · MapLibre GL · deck.gl · Tailwind · shadcn/ui · Recharts · Model Context Protocol · US Census ACS 2023
