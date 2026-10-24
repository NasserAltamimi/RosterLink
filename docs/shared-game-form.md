# Shared player-game form and competitive experience

This local change replaces game-specific forms for all selectable games, including Rocket League. Authentication, password rules, UI language and ownership protections are unchanged.

The [2026-10-24 competition-selection fixes](competition-selection-fixes.md) document the live investigation, grouped editions, typed results, and current search bounds.

## Demonstration

1. Open Game profiles and choose any game.
2. Choose a platform and a Play region, enter communication languages and availability for playing/tryouts with a timezone. Regions are broad geographic choices, plus Other with custom text and Not applicable. No region is selected by default. Prior custom regions reopen under Other with their text intact.
3. Optionally enter any self-reported rank text.
4. Optionally search competitions (try `EWC`) or choose **Add tournament manually**. Select the competition edition, then choose a self-reported Placement / elimination stage or enter any result manually. Every entry requires name, edition/year, and a result. Existing stage context is retained.
5. Add more entries, edit fields, or delete entries, then save. Reload or log in again to check persistence. Repeat for another game.

Participation and placement are always self-reported. A PandaScore reference identifies the source of tournament metadata only. Saving never checks provider winners, results, attendance, identity, or evidence. A first-place claim is accepted. No reviewer workflow exists.

## Data model and compatibility

New/updated player-game sections use `schemaVersion: 2`. Existing game/profile IDs, unique profile-game constraints, session authentication, CSRF protection, and ownership checks are reused.

| Stored field | Meaning / migration |
| --- | --- |
| `details.platform` | Required shared platform option. No platform is inferred for old sections; the player selects it on their next save. |
| `details.server` | Required Play region value, still stored as a string. Existing custom text prepopulates Other without changing the value. |
| `details.language` | Required communication languages, chosen with the shared Arabic / English / Other picker and stored as one comma-separated string (max 120 characters). Existing `language` is reused; earlier free text separated by commas, slashes or semicolons reopens with the matching selections and any other languages under Other. Values are trimmed and de-duplicated on the client and server. This value is separate from the profile's general languages. |
| `details.availability` | Required playing/tryout availability text. Existing `availability` is reused; the player can expand it for tryouts. |
| `details.rank` | Optional self-reported text within 100 characters. Existing `rank` is reused. Missing rank becomes an empty string on save. |
| `experience[]` | Up to 20 entries with `name`, `edition`, `placement`, optional `stage`, optional old `tournament` reference or grouped `competition` reference, and optional typed `result`. See the linked compatibility documentation. |
| `legacyDetails` | Complete original details map retained on the first shared-form update of a version-1 section. It is not overwritten on subsequent updates. |

No bulk rewrite of player data is performed. Reading a version-1 section returns its original `details`, a shared-field projection, and the original details as `legacyDetails`. On first update, the server snapshots the **stored** map rather than trusting a client copy. Original Rocket League playlist, division, season, preference, rank, language, server and availability are retained. Older generic `playerName` and `preference` values are retained too. Unknown legacy keys are also preserved. The original snapshot is visible under **Previously saved details** in the editor and overview. New requests cannot overwrite this snapshot or submit arbitrary legacy fields.

Omitting `experience` from an update preserves the existing list; submitting `[]` clears it. The UI sends the complete edited list. Deleting a section deliberately deletes that section and its retained details, following the existing confirmation flow.

Tournament references are validated for positive integer IDs and the selected game's provider ID. Metadata snapshots persist through provider outages. Changing an entry's name, edition, or stage in the UI converts it to manual metadata; changing placement retains the provider reference. References are not identity or participation attestations. Backend schema and length validation applies to all requests.

## Provider integration and bounds

- Game lookup uses stored numeric `Game.providerId` with `/videogames/{id}/tournaments`, never a guessed game-specific prefix. Catalog sync matches existing provider IDs before slugs to preserve local IDs. Rocket League is explicitly mapped to PandaScore game 22.
- The browser calls authenticated `/api/games/:localGameId/tournaments?q=...&page=...`. `PANDASCORE_API_TOKEN` stays server-side and is never included in URLs, browser responses, or logs.
- Opening the form makes **no** tournament request. Searches require 2–80 characters and wait 400 ms after typing. Obsolete responses cannot replace current results when query, page, or game changes.
- Each search page uses two name/slug streams, plus a third for the verified Mobile Legends EWC/MSC association. Up to 20 stage records per stream are grouped by game/league/series IDs. Pages 1–20 are allowed; partial searches are clearly labeled. Substring search can miss unfamiliar competition names.
- Selecting an edition verifies its game and league, loads at most 100 stages, and inspects bounded standings/brackets for up to two main-stage candidates. Result choices keep exact placements, ranges, top cutoffs and elimination rounds distinct. Manual results are always available.
- Successful endpoint responses are cached for 5 minutes by full endpoint/query, with capacity 300 and pending-request deduplication. The in-process cache clears on restart.
- Upstream timeout is 6 seconds; detail inspection allows 30 seconds in the UI. At most eight concurrent requests and 60 upstream calls/minute are allowed per process. Authenticated lookup routes allow 30 requests/minute per player. Existing app-wide limits still apply.
- Provider 429 responses establish a 30–300 second cooldown using numeric `Retry-After` where available. Outages, missing credentials/mappings, malformed data, and unavailable coverage return safe messages. Failures are not cached as results. Manual entries and saved selections can still be saved without contacting PandaScore.
- Only metadata is returned to the browser. Provider winner/result fields are discarded. Records belonging to a different game are excluded.

## Actual coverage checked on 2026-10-23

One `per_page=1` request per game returned HTTP 200 and at least one tournament with the current key. Counts are PandaScore's `X-Total` header at check time, **not** a downloaded database or a guarantee of complete/current coverage.

| Provider game ID | Game | Reported tournaments |
| --- | --- | ---: |
| 34 | Mobile Legends: Bang Bang | 159 |
| 30 | StarCraft Brood War | 128 |
| 29 | StarCraft 2 | 544 |
| 28 | LoL Wild Rift | 102 |
| 27 | King of Glory | 260 |
| 26 | Valorant | 1,514 |
| 25 | EA Sports FC | 89 |
| 24 | Rainbow 6 Siege | 544 |
| 23 | Call of Duty | 142 |
| 22 | Rocket League | 550 |
| 20 | PUBG | 47 |
| 14 | Overwatch | 356 |
| 4 | Dota 2 | 3,284 |
| 3 | Counter-Strike | 8,335 |
| 1 | LoL | 2,208 |

The implemented search was also smoke-tested against live EWC data for Rocket League and Valorant. Both returned 2026 competition metadata with separate Playoffs/group stages and pagination. Some catalogs contain older competitions; support does not imply recent or local amateur coverage. Some records lack edition or stage metadata. Edition/year must then be entered by the player; manual entry always remains possible.

Reproduce the bounded coverage check with `node scripts/tournament-coverage.js` (writes a sanitized report under ignored `.local-data/`). Run `node scripts/tournament-search-smoke.js` for two live searches. Both require server-side credentials and network access. Automated tests use deterministic fixtures instead of credentials or quota.

Reference: [PandaScore videogame tournament endpoint](https://developers.pandascore.co/reference/get_videogames_videogameidorslug_tournaments).

## Verification

`npm run check` runs unit/integration checks and the production build. `npm run test:e2e` exercises desktop and mobile Chrome with isolated MongoDB. Added coverage includes shared required fields, optional rank/experience, API/manual entries, edits/deletions, game filtering and numeric mappings, bounds, pagination, caching, provider outage/429 behavior, ownership, legacy retention, persistence and responsive layout. Live smoke checks are separate.

All changes are local. No push, PR, merge, deployment, Trello change, or submitted project-plan edit is part of this work.
