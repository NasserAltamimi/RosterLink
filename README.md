# RosterLink

A responsive esports player platform for SWE 444 at King Saud University. The wider workflow is **player profile → team opening → application → review → tryout → decision**.

This branch implements accounts, secure sessions, manual player profiles, a MongoDB-backed game catalog, separate game sections, persistent profile/header images, and PandaScore competition metadata lookup. All selectable games share one form, with self-reported rank and competition results. Organization management, recruitment, password recovery, notifications, verification, social features, and player-account integration remain later work.

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
npm run seed
npm run sync:games
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to Express at `127.0.0.1:3001`. Use `127.0.0.1` consistently rather than mixing it with `localhost`. Stop with Ctrl+C. Restarting retains development accounts, sessions, profiles, game sections, and images. The seed only configures Rocket League; it creates no demo users or fabricated provider data.

## Build and verify

```powershell
npm test
npm run build
npm run test:e2e
```

- `npm test`: domain and Supertest integration checks against an isolated real MongoDB process, including database restart persistence and authorization attacks. Development data is untouched.
- `npm run build`: frontend compilation to ignored `dist/`.
- `npm run test:e2e`: Playwright runs React/Express/MongoDB in desktop and mobile Chrome. Requires installed Google Chrome; alternatively change `channel` in `playwright.config.js` or install Playwright Chromium and omit `channel`. Uses ports **3002 and 5174** and an isolated database. Reports/screenshots are in ignored `playwright-report/` and `test-results/`.
- `npm run check`: tests followed by the build, with failure propagation.

To demonstrate the compiled frontend with Express, keep MongoDB running, build, then in a separate PowerShell terminal:

```powershell
$env:APP_ORIGIN = 'http://127.0.0.1:3001'
npm start
```

Open http://127.0.0.1:3001. Production requires HTTPS, `NODE_ENV=production`, the correct HTTPS `APP_ORIGIN`, a strong secret, secured durable MongoDB/storage, and a properly configured trusted proxy. These instructions do not deploy anything.

## Demonstrate Sprint 1

1. Open a clean browser context and register with a valid email and a 12–128 character password. Registration signs you in.
2. Enter a gaming name, bio, region/country, and comma-separated languages; create the profile.
3. Open **Edit profile** and upload both a profile image and a header: JPEG/PNG/WebP, at most 5 MB and 20 megapixels each.
4. Open **Game profiles**. Select any game, choose a platform and Play region (Other allows custom text), and enter communication languages and playing/tryout availability with a timezone. Rank is optional. Optionally search `EWC`, select a competition edition, then choose a result or enter one manually. Participation and results remain self-reported. Save and reload.
5. View the overview, reload, edit a value, log out, and log in again. Confirm saved details and both images return.
6. Create a second account in a separate browser context. The first account's profile/game/image IDs cannot be read or modified using this session. Automated tests reproduce the attack requests.
7. Try an invalid login, duplicate email, invalid image, and failed connection. Check useful errors and preserved form edits.

`npm run sync:games` imports PandaScore's game catalog using the server-only `PANDASCORE_API_TOKEN` in `.env`. All selectable games, including Rocket League, use one shared form: platform, server/play region, communication languages, and playing/tryout availability are required; rank and competitive experience are optional. Tournament experience supports backend PandaScore search and manual entry. Participation and placement are **self-reported**. Existing player-game IDs and original details are retained. See [shared-form behavior, migration, actual coverage, bounds, and demonstration](docs/shared-game-form.md).

See [competition-selection fixes and verified EWC/MSC coverage](docs/competition-selection-fixes.md) for the region dropdown, grouped competition editions, separate result choices, compatibility rules, and live provider/backend/UI checks.

The interface is **English/LTR**. Arabic input/Unicode persistence are supported; logical CSS properties and per-field `dir="auto"` prepare for localization. A translated Arabic/RTL interface is not implemented or claimed complete.

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
