# Play region and competition selection fixes — 2026-10-24

## Confirmed causes

1. **Region:** the old control was a text input with a datalist containing only `Not applicable`. It did not supply useful selectable geographic regions. Its stored free-text values were valid and must not be discarded.
2. **Duplicate competitions:** PandaScore tournaments represent stages. The old response mapped every stage ID to its own selector item and dropped league/series IDs, so Group A, Group B and Playoffs appeared as separate competitions.
3. **Mobile Legends EWC search:** the actual catalog mapping is correct: Rocket League is provider game **22**; Mobile Legends: Bang Bang is **34**. Direct API name searches for `EWC`, `Esports World Cup`, `MSC`, and `Mid Season Cup` returned no stage-name matches. Rocket League's slug search `esports-world-cup` returned **13 stages across 3 editions**, under league **5284**. The same slug for Mobile Legends returned zero. Mobile Legends instead uses league **5264**, `Mid Season Cup`, with slugs containing `mid-season-cup`: **21 stages across two 20-record pages**, spanning 2024–2026. The original EWC alias searched only `esports-world-cup`, so it could not find these records.

The previous search cache already included game ID, query and page. There was no evidence of a cross-game cache-key collision. Empty results could remain cached for five minutes, but caching was not the underlying naming mismatch. Checking only one name/page would not have established missing coverage.

## Verified association, not a blanket alias

PandaScore's Mobile Legends league 5264 contains series **7694 (2024), 9462 (2025), and 10754 (2026)**. Publisher/organizer material confirms MSC at EWC for these years: [MOONTON's 2026 announcement describing the third consecutive year](https://en.moonton.com/news/325.html), [MOONTON's 2026 MSC announcement](https://en.moonton.com/news/351.html), and [EWC's 2025 MSC report](https://www.esportsworldcup.com/en/news/team-liquid-win-mlbb-msc-ewc-25).

`EWC` and `Esports World Cup` now add a `mid-season-cup` search **only for game 34**, retaining only the verified league/series/year tuples above. `MSC` expands to `Mid Season Cup` only for game 34. Optional year suffixes are supported. Future or unidentified MSC editions are not silently labeled as EWC. Names from the API remain visible as `Mid Season Cup`, with an association note.

## Implemented behavior

- **Play region:** required empty initial selection; Middle East, Europe, North America, South America, Asia, Africa, Oceania, Other, and Not applicable. Other reveals required custom text. Help explains these are geographic choices, not official game-specific servers. Values remain in the existing `details.server` string. A saved non-list value opens as Other with its text preserved; it is never coerced to Not applicable.
- **Competition first:** search groups only records with consistent positive game, league, and series IDs. Matching names alone never merge records. Name and edition/year are displayed once per identity on each page. Selecting an edition loads its stages and retains underlying stage IDs; matching stages can span search pages.
- **Separate result:** `Placement / elimination stage` offers competition-specific metadata suggestions and an always-available manual result. The dropdown distinguishes exact places, ranges, top cutoffs, and elimination rounds. Unsupported suggestions are omitted; any self-reported text can still be saved manually.
- **No verification:** participation/results are always self-reported. The backend never looks up the user's team/player, compares claims to winners/standings, requests evidence, or starts a review workflow. Reading standings/brackets is solely to understand the competition's possible result vocabulary.

## What actual result metadata supported

Inspected live Rocket League series **10850 (2026)** and **9499 (2025)** and Mobile Legends series **10754 (2026)** and **9462 (2025)**. Stage, standing, and bracket endpoints all returned HTTP 200 with the current key. The main playoff brackets showed four quarterfinals, two semifinals, a championship final, and a third-place match; predecessor links showed the progression.

For the inspected 2026 editions the UI offers champion/exactly 1st, runner-up/exactly 2nd, exactly 3rd/4th where standings and the third-place match support them, semifinal exit, quarterfinal exit, Top 8, and a 5th–8th placement range. These are **separate selectable claims**. Quarterfinal exit is not converted to exactly eighth; ordinal provider rows 5–8 alone are not treated as evidence of unique exact placements. Top 6 is not automatically suggested. It remains permissible as a manual claim.

Main-stage finals are distinguished from wildcard/qualifier/group stages. Elimination suggestions are suppressed when loser links lead to a continuing lower bracket. Top-8/range suggestions require the observed single-elimination predecessor graph; incomplete brackets are discarded for inference. Group standings never establish the overall competition winner. Elimination-round labels describe exit from title contention, not an exact final placement.

## Compatibility and stored fields

Existing section IDs, custom region strings, legacy detail maps, experience names/editions/placements/stage text, and old `tournament: { provider, id, gameId }` references remain intact. Existing text results reopen in manual mode without rewriting the string. No bulk data migration is performed.

New experience entries may store `competition: { provider: 'pandascore', gameId, leagueId, seriesId, stageIds }` and `result: { kind, value }`. The human-readable `placement` string is retained for compatibility and display. Result kinds are `exact`, `range`, `top`, `elimination`, or `manual`. Stage IDs are unioned with retained IDs on refresh (up to the documented 100-ID bound). Editing competition metadata makes that metadata manual; editing a result does not remove its competition reference. Refresh failures do not clear a saved result, reference, or stage ID.

## Bounds and remaining limitations

- Search is debounced by 400 ms, requires 2–80 characters, and fetches no competitions on form open. Each page requests at most 20 stages from each of two ordinary search streams; the verified Mobile Legends EWC alias adds a third stream. Pages 1–20 are allowed. The selector deduplicates by competition identity within the page, while editions can repeat across pages because their matching stages span pages.
- Selecting an edition first verifies the series' game/league parent IDs, then fetches at most two pages of 50 stages. It inspects standings/brackets for at most two candidate main stages, at most 100 records per endpoint. Each upstream call has a six-second timeout; the UI allows up to 30 seconds for detail inspection while leaving manual results available.
- Successful endpoint responses and empty lists are cached for five minutes, capacity 300 entries, with pending-request deduplication. Keys include the full endpoint path and query (therefore game/search/page); globally unique series/stage endpoint IDs are rechecked against the requested parents. Provider requests are limited to 60/minute and eight concurrent requests per process. Authenticated lookup routes allow 30 requests/minute **per player**, avoiding one player consuming another's route allowance on a shared IP. Existing global app limits still apply.
- Provider errors and 429 cooldowns are distinct from empty matches. If only some search streams succeed, successful results are retained with an incomplete-source warning. Pagination, skipped inconsistent IDs and hard limits also mark the search incomplete. The UI never treats a bounded empty page as proof of missing coverage.
- The result extractor is conservative and recognizes explicit English main-bracket round labels and predecessor links. It does not comprehensively model every sport/format. Missing, gated, incomplete, or unfamiliar formats fall back to manual results. Curated EWC associations need explicit review for future editions.
- Result choices are metadata suggestions, not certified outcomes. Typed claims are schema-validated but are not verified against provider participants or results. There are at most 20 experience entries per section and 100 retained stage IDs per competition reference.

## Verification and reproduction

`npm run check` covers persistence, ownership, aliases, parent-ID consistency, grouping, result types, legacy/custom-region retention, caching, rate limits, partial errors and incomplete metadata, and builds the frontend. `npm run test:e2e` covers desktop/mobile UI, saving/reopening, game switching, manual entry, aliases, pagination and old stage-reference compatibility. Fixtures are sanitized actual metadata collected on the check date, without provider credentials or team/player results.

`node scripts/competition-live-check.js` additionally compares **live direct responses → actual backend responses → compiled Chrome UI**. It first checks the existing local catalog's provider mappings, then creates an isolated temporary MongoDB/app/browser session. It does not change existing accounts or profiles. The live run confirmed three UI/backend edition choices for each game, with 13 direct Rocket League stages and 21 direct Mobile Legends stages across bounded pages. The selected 2026 editions retained 3 and 7 stage IDs respectively. Requires the local catalog at port 5173, configured server credentials, Chrome, and network access.

The live compiled-page check also exposed an existing development-JSX/production-runtime mismatch (`jsxDEV is not a function`) despite a successful build. `vite.config.js` now explicitly aligns the JSX transform with the build command; the compiled UI was then exercised successfully.

For manual review: open Game profiles, choose a region or Other, search EWC in Rocket League, select an edition and a result, then repeat in Mobile Legends. Try MSC/Mid Season Cup, paging, a manual result, save and reload. Review a prior custom region/experience entry too.

All work remains local; no push, PR, merge, deployment, Trello or submitted project-plan changes.
