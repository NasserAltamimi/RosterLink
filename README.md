# RosterLink

A responsive esports player platform for SWE 444 at King Saud University. The wider workflow is **player profile → team opening → application → review → tryout → decision**.

RosterLink supports accounts, password recovery, player profiles, organizations, game-specific teams, and recruitment openings. In Sprint 3, players can apply, track progress, and respond to tryout invitations. Managers review applicants and record decisions. Player profiles support opt-in affiliations and Liquipedia tournament metadata. Player ranks and competition results are self-reported.

## Run locally

Requirements: Node.js **22.12+** (verified with 24.15.0), npm, and internet access for dependencies and the first MongoDB binary download. Run commands from the repository root.

```powershell
npm ci
npm run setup:local
```

`setup:local` adds missing settings to ignored `.env`, generates a random session secret, and preserves existing values, including provider tokens. Alternatively copy `.env.example` to `.env` and supply a random secret of at least 32 characters. Never commit `.env`.

In terminal 1:

```powershell
npm run db
```

This starts **real MongoDB 8.0.17**, bound to `127.0.0.1:27017`, with persistent WiredTiger files in `.local-data/mongo/`. The library used to start it is named `mongodb-memory-server`; this command explicitly uses disk storage and retains it on shutdown. It is not an in-memory substitute for MongoDB. The Windows download is about 756 MB. An existing local MongoDB or Atlas instance can instead be configured through `MONGODB_URI`; then skip this command. Do not run two instances on port 27017.

In terminal 2, after MongoDB is ready:

```powershell
npm run sync:games
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to Express at `127.0.0.1:3001`. Use `127.0.0.1` for local access. Stop with Ctrl+C. Restarting retains development accounts, sessions, profiles, game sections, and images. Catalog setup works offline once MongoDB is running.

## Local demo

With local MongoDB running, execute `npm run seed:demo` from the repository root. The seed uses the development database and image directory from `.env`. It adds fictional records with stable IDs and keeps existing records and edits. It can be rerun.

Sign in with the demo password `RosterLink Demo 2026!`.

| Account | Start here |
| --- | --- |
| `new@rosterlink-demo.test` | My Workspace, with a fresh account |
| `player@rosterlink-demo.test` | Openings → Rotation player · 3v3, ready for a new application |
| `active@rosterlink-demo.test` | Applications or Notifications, with a tryout awaiting a response |
| `recruiter@rosterlink-demo.test` | Organizations → Stratos Vale → Stratos Velocity, or My Profile for the same account’s player view |
| `captain@rosterlink-demo.test` | Organizations, with one organization to manage |

For discovery, open **Discover → Feed** (or **View feed** in My Workspace). The player demo starts in Following with Lina “Pulse” Faris and Stratos Vale. Under **Find accounts**, search for **Stratos Velocity** and follow the team to add its updates. The new-account demo starts in All. Following always belongs to the signed-in account.

For posts, sign in as `player@rosterlink-demo.test` and choose **My Profile → Posts**. As `recruiter@rosterlink-demo.test`, choose **Organizations → Stratos Vale → Posts** to publish as the club, or **Stratos Velocity → Manage team → Posts** to publish as the team. Sign in with a different demo account and visit the author's public page to react or comment. The seed includes public posts, reactions, and comments for all three author types.

## Build and verify

Password recovery (SF-03) uses server-only Gmail SMTP from **rosterlink0@gmail.com**. Configure either `GMAIL_APP_PASSWORD` or all three `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` in ignored `.env`, then restart the API. Keep `APP_ORIGIN` set to the actual browser origin. Missing mail credentials show an unavailable message; a sender address alone cannot authenticate Gmail. See [setup, security behavior, and verification](docs/password-recovery.md).

```powershell
npm test
npm run build
npm run test:e2e
```

- `npm test`: domain and Supertest integration checks against an isolated real MongoDB process, including database restart persistence and authorization attacks. Development data is untouched.
- `npm run build`: frontend compilation to ignored `dist/`.
- `npm run test:e2e`: Playwright runs React/Express/MongoDB in desktop and mobile Chrome, restarting the API and isolated database between device projects so their authentication attempts do not share a rate-limit budget. Application rate limits are unchanged. Requires installed Google Chrome; alternatively change `channel` in `playwright.config.js` or install Playwright Chromium and omit `channel`. Uses ports **3002 and 5174**. Reports/screenshots are in ignored `playwright-report/` and `test-results/` (the latest project run); tracked Sprint 2 evidence images include both devices. Arguments such as `--project=desktop-chrome` or a test filename are forwarded.
- `npm run check`: tests followed by the build, with failure propagation.

To demonstrate the compiled frontend with Express, keep MongoDB running, build, then in a separate PowerShell terminal:

```powershell
$env:APP_ORIGIN = 'http://127.0.0.1:3001'
npm start
```

Open http://127.0.0.1:3001. Production requires HTTPS, `NODE_ENV=production`, the correct HTTPS `APP_ORIGIN`, a strong secret, secured durable MongoDB/storage, and a properly configured trusted proxy. These instructions do not deploy anything.

## Demonstrate Sprint 1

1. Open a clean browser context and register with a valid email and a 12–128 character password. Registration signs you in.
2. Enter a gaming name, bio and region/country, choose languages (Arabic, English, and/or Other with custom text), and create the profile. A green confirmation appears at the top right after each successful save.
3. Open **Edit profile** and upload both a profile image and a header: JPEG/PNG/WebP, at most 5 MB and 20 megapixels each.
4. Open **Game profiles**. Select any game, choose a platform and Play region (Other allows custom text), choose communication languages (Arabic / English / Other) for that game and enter playing/tryout availability with a timezone. Rank is optional. Optionally search `EWC`, select a competition edition, then choose a result or enter one manually. Participation and results remain self-reported. Save and reload.
5. View the overview, reload, edit a value, log out, and log in again. Confirm saved details and both images return.
6. Create a second account in a separate browser context. The first account's profile/game/image IDs cannot be read or modified using this session. Automated tests reproduce the attack requests.
7. Try an invalid login, duplicate email, invalid image, and failed connection. Check useful errors and preserved form edits.

All games share a form with platform, play region, communication languages, and playing/tryout availability. Rank and competitive experience are optional. Profile experience uses PandaScore metadata search and manual entry. See [shared-form behavior and saved data compatibility](docs/shared-game-form.md).

## Demonstrate Sprint 2

Use **Manage organization** (`/manage`) with an existing signed-in account; a player profile is optional. Create an organization, add game-specific teams, then assign existing registered users by email to organization-wide or individual-team management scopes. Team managers cannot assign roles or manage sibling teams. At least one organization manager must remain.

Publish an opening from its team with role, platform, game-specific requirement text, optional rank/context, region, language, IANA timezone and a future deadline. Choose required playing availability from a weekly day/time table, with one time block per selected day and 15-minute time choices. End times earlier than start times finish the next day; overlapping blocks are rejected. The API stores structured selections and generates a consistent schedule summary. Previously saved text schedules remain readable; editing them requires choosing structured days/times. The game comes from the immutable team reference. Deadlines entered in browser-local time are stored as UTC instants; schedules keep their explicit timezone. Active expired openings may be edited with a new future deadline; manually closed openings remain preserved and cannot be edited or reopened.

Visit **Browse openings** (`/openings`) signed in or as a guest. Filters combine game and literal case-insensitive role/region/language text. Public organization (`/organizations/:id`), team (`/teams/:id`), and opening (`/openings/:id`) links work after refresh. Closed/expired details remain readable with their status; active lists exclude them.

See [Sprint 2 evidence](docs/sprint-2-evidence.md) for the two-organization demonstration, exact verification results, screenshots, test cases, and review table. `node --test tests/recruitment.test.js` runs the isolated MongoDB API/security/restart checks; `npm run test:e2e -- tests/browser/recruitment.spec.js` runs the desktop/mobile browser journeys. No provider credentials are needed for Sprint 2.

See [competition-selection fixes and verified EWC/MSC coverage](docs/competition-selection-fixes.md) for the region dropdown, grouped competition editions, separate result choices, compatibility rules, and live provider/backend/UI checks.

Sprint 2 shipped English interface controls and supported Arabic content. Sprint 3 adds an **العربية / English** header switch on public and signed-in pages. It changes language and layout direction in place and remembers the choice across sign-in and refresh. Names, posts, comments, and provider content retain their original text. The missing-profile and unavailable-account fallback labels still appear in English.

## Sprint 3 game catalog, ranks, and tournaments

`npm run sync:games` applies the local snapshot in [`liquipedia-catalog.js`](server/modules/games/liquipedia-catalog.js). It includes the 31 Main wikis from the Liquipedia Hub list, plus Chess and PUBG Mobile from the API coverage page. Shared wikis can include more than one edition or title. To refresh, review those official lists, confirm each wiki identifier, update the snapshot while retaining existing slugs and provider IDs, then rerun the command. Existing records are matched by wiki, slug, or legacy PandaScore ID, and updated in place. [Liquipedia Hub wiki list](https://liquipedia.net/hub/Support/Liquipedia), [Liquipedia API game coverage](https://liquipedia.net/api).

Players can select an optional self-reported rank where publisher options are listed in [`ranks.js`](server/modules/games/ranks.js). The profile editor links to each publisher's guide and keeps previously saved values available. Other games accept optional rank text.

Open **Tournaments** (`/tournaments`) to browse up to 30 listings per game, ordered by start date descending. Set `LIQUIPEDIA_API_KEY` in the ignored root `.env` and restart the API to enable the feed. The Express server makes all provider calls and serves a one-hour cache per wiki. During a provider failure, available cached results can be shown for up to 24 additional hours. MongoDB enforces a shared rolling limit of 60 requests per hour across RosterLink instances using the same database. Share the database among instances using the same key and dedicate that key to this deployment. [Liquipedia API terms](https://liquipedia.net/api-terms-of-use).

In **My Profile → Game profiles**, search Liquipedia by name or year and add a tournament to the selected game. Search covers up to 500 cached listings per wiki, and a search returns up to 20 matches. Each saved match shows its source and retrieval date. Enter your own placement and stage. The manual form and the optional PandaScore lookup remain available, and saved Liquipedia records can be edited during outages.

The feed uses the public v3 tournament example and documented tournament fields. The full v3 dashboard requires signed-in access. A v3 game-catalog or player-rank endpoint could not be confirmed in the public documentation. [Official v3 example](https://liquipedia.net/commons/Support/Bot/Advanced_Usage), [tournament fields](https://liquipedia.net/commons/Help:LiquipediaDB/Tournament), [v3 dashboard](https://api.liquipedia.net/documentation/api/v3).

## Review Sprint 3 recruitment locally

1. Use two accounts in separate browser sessions. On the manager account, create an organization and a team, then publish an opening.
2. On the player account, create a Player Profile. Open the published opportunity, enter an introduction and availability, and submit. Use **My Applications** from the workspace or profile to track or withdraw an active application.
3. On the manager account, open **Review applicants** from the team’s opening. Mark the application in review, shortlist it, and send an invitation. The player can open the notification and respond. The manager can then record an acceptance or rejection.
4. Use **My Organizations** on your player profile to jump to assigned management pages. Publish individual roles if you want a public visitor to see those affiliations.

Closed and expired openings stop receiving submissions. Managers can still review existing applications. An application can have one tryout invitation, and each invitation shows the organizer’s time zone and the viewer’s local time when they differ.

## Optional PandaScore access smoke test

```powershell
npm run smoke:pandascore
```

Set `PANDASCORE_API_TOKEN` in root `.env`. This read-only server-side `/videogames` request uses a Bearer header and prints a sanitized status/catalog summary. It never prints the token or puts it in a URL. The player flow does not depend on PandaScore. This probe is not a completed product integration or verification feature. See [PandaScore authentication](https://developers.pandascore.co/docs/authentication).

## Team and evidence

- [Collaboration guide](CONTRIBUTING.md): branch/PR and Trello workflow. Pushes, PRs, merges, and deployment require the owner's explicit instruction in this session.
- [Architecture and API](docs/architecture.md).
- [MongoDB guide and schema history](docs/data-model.md).
- [Sprint 1 evidence](docs/sprint-1-evidence.md): results, statuses, commits, and remaining checks.
- [Original handoff](RosterLink_Sprint1_Context_Handoff.md): historical context, superseded where the approved sprint scope differs.
- [Trello board](https://trello.com/b/Fx89828x/rosterlink-swe444).
