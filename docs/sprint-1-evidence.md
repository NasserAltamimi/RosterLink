# Sprint 1 implementation evidence

## Approved scope and decisions

The owner's implementation prompt approved SF-01, SF-02, SF-04–07, TF-01–04, KF-01, and KF-04. It supersedes the handoff's provisional sprint scope: JavaScript, React/Vite, Express, MongoDB/Mongoose; Rocket League pilot; both images included; password reset and later product modules deferred. The original handoff is preserved unchanged.

Session decision: MongoDB-backed Express sessions, HTTP-only signed ID cookie, seven-day cookie lifetime, Secure in production, CSRF synchronizer tokens, login/session regeneration, server-side logout invalidation. Journaled writes preserve acknowledged account/profile/session writes across a database restart. Image persistence uses a local storage boundary with validated, resized, metadata-stripped WebP files and ownership checks on every access.

## Local implementation commits

Branch: `feature/sprint-1-player-foundation`.

| Commit | Implementation | Stories |
| --- | --- | --- |
| `e0885c9` | Express modules, MongoDB models/catalog, sessions, owner-filtered profiles/games/images, development MongoDB and environment setup, backend tests | SF-01, SF-02, SF-04, SF-05, SF-06, SF-07, TF-03, TF-04 |
| `128c940` | Integrated responsive React workspace, catalog-driven game forms, image controls, browser checks, build setup, safe PandaScore smoke script | SF-01, SF-02, SF-04, SF-05, SF-06, SF-07, TF-02 |
| `ff6e58a` | Guard generated test-directory cleanup so it stays inside the workspace; backend/browser checks rerun successfully | TF-03 |
| Documentation commit following these | README, collaboration guide, model/schema guide, architecture, original handoff, this evidence and screenshots | TF-01, TF-03, KF-01, KF-04 |

The documentation commit's own hash is available in `git log`; it cannot embed its own hash. The repository's existing local identity/credential selection was retained: `MHWS7`, with the existing `origin` at `https://github.com/NasserAltamimi/RosterLink.git`. No global or work-account Git settings were changed.

**Everything remains local. Nothing was pushed, no pull request was opened, no branch was merged, no deployment occurred, and repository visibility was not changed.**

## Commands and actual outcomes

Verified on Windows with Node 24.15.0, npm 11.12.1, MongoDB 8.0.17, and installed Google Chrome. Runtime/development dependencies are pinned in package.json/package-lock.json.

| Command/check | Actual outcome |
| --- | --- |
| Dependency installation | Succeeded; install audit reported 0 vulnerabilities |
| `npm run setup:local` | Added 7 missing local settings; preserved existing PandaScore token and existing values |
| `npm run db` | Real persistent MongoDB running on loopback port 27017, WiredTiger data in ignored `.local-data/mongo` |
| `npm run seed` | Succeeded; Rocket League catalog only; no fabricated accounts/provider data |
| `npm run dev` | React at 127.0.0.1:5173 and Express at 127.0.0.1:3001 started successfully |
| Live `/api/health` and proxied `/api/games` | HTTP 200; health ok; one supported catalog entry |
| `npm test` | **17 passed, 0 failed**; final run after error sanitization |
| `npm run build` | Passed; frontend assets compiled |
| `npm run check` | Passed; 17 tests followed by build |
| `npm run test:e2e` | **8 passed, 0 failed**, desktop and mobile Chrome; normal exit 0 |
| `git diff --check` | Passed |
| Root `.env` Git checks | Ignored by `.gitignore`; absent from tracked files |
| Configured token/secret scan | No actual PandaScore token or session-secret value in Git candidate files or built assets |
| `npm run smoke:pandascore` | Real authenticated HTTPS request: HTTP 200, JSON array of 15 games; Rocket League id 22/slug rl and EA Sports FC id 25/slug fifa present |

The PandaScore check uses a Bearer header; it never prints the token or puts it in a URL. It tests provider access/catalog coverage only. It does not implement the product's third-party integration, fetch live ranks, verify ownership, or replace the MongoDB game catalog. [Official authentication](https://developers.pandascore.co/docs/authentication) and [catalog endpoint](https://developers.pandascore.co/reference/get_videogames).

## Test cases and results

Backend/domain cases are in `tests/catalog.test.js` and `tests/integration.test.js`. The latter starts an isolated real mongod and uses actual Mongoose/HTTP/session/file operations.

| Cases | Result |
| --- | --- |
| Valid game fields normalize correctly | Pass |
| Invalid rank/playlist/division/server/preference rejected | Pass |
| Unranked/Supersonic Legend division rules | Pass |
| Missing, malformed, unknown, overlong game fields rejected | Pass |
| Generic validator accepts independently configured future fields | Pass; unit fixture only, not another supported production game |
| Registration persists normalized email/hash, excludes hash, rejects duplicate email | Pass |
| Invalid registration, query-object injection, client-selected role rejected | Pass |
| Wrong/absent-user login, valid login, cookie flags, session rotation, logout/replay | Pass |
| Anonymous reads, missing/stale CSRF, and foreign-origin writes rejected | Pass |
| Profile create/read/edit, duplicate prevention, restore after new login | Pass |
| Required/overlong profile input and owner mass assignment rejected | Pass |
| Catalog/game create/edit/read/delete, duplicate and invalid options | Pass |
| Database unique indexes enforce email, profile owner, and profile/game pair | Pass |
| Both images upload/read/replace/remove, decode as WebP, replaced-file cleanup | Pass |
| Missing/corrupt/disguised/unsupported/oversized/excessive-pixel images rejected | Pass |
| User B cannot read/edit User A profile, create/edit/delete its games, or read/upload/delete either image kind | Pass |
| Account, session, profile, game, and both images survive real MongoDB/Express restart | Pass |

The following four browser scenarios each pass on desktop Chrome and mobile Chrome (Pixel 7 emulation):

| Browser scenario | Desktop | Mobile |
| --- | --- | --- |
| Register → profile → game → both images → edit → reload → logout → later login | Pass | Pass |
| Startup connection failure, clear feedback, successful retry | Pass | Pass |
| Native invalid-input checks and invalid-login error | Pass | Pass |
| Failed save preserves edits; unsupported image feedback | Pass | Pass |

The full browser journey checks that image pixels loaded, saved game/profile values return, there are no uncaught page errors, and the overview has no horizontal overflow. Arabic input is included in the saved bio. Desktop/mobile overview screenshots were inspected visually: [desktop](evidence/player-desktop.png), [mobile](evidence/player-mobile.png). The solid-color uploads in these screenshots are generated test images, not provider assets.

## Failures encountered and resolved

- Sandboxed dependency/provider/MongoDB downloads lacked network access; rerun with the necessary execution approval succeeded.
- Initial image reads returned 404 because Express ignored the hidden `.local-data` path. Authenticated serving now permits that directory using validated storage keys.
- The real database-restart test exposed loss of very recent session writes after the test harness terminated mongod on Windows. Journal acknowledgements now cover application and session writes; the full restart test passes. Session touches are throttled to avoid redundant writes and shutdown races.
- Exact browser label selectors included required-field markers, and two Edit profile buttons made a test locator ambiguous. Scoped/role-based selectors fixed the tests; all scenarios now pass.
- Sandboxed Playwright could finish all scenarios but not cleanly stop child servers. An approved run outside those process restrictions completed and exited 0. Ordinary test output also includes harmless NO_COLOR/FORCE_COLOR environment warnings.
- Running the documented seed command exposed premature collection creation with disabled Mongoose buffering. Startup buffering is now bounded to five seconds; seeding and development startup were rerun successfully.
- Backend NODE_ENV in root `.env` influenced React build selection. Vite now explicitly compiles production React for build and development React for dev.

## Story status

Completed means the approved Sprint 1 scope passed local acceptance checks. It does not imply deployment or completed team learning.

| Story | Status | Evidence / remaining work |
| --- | --- | --- |
| SF-01 | Completed | Persistent registration, input/duplicate validation, hashes, browser/API tests |
| SF-02 | Completed | Login/logout, refresh, rotation, replay rejection, restart persistence |
| SF-04 | Completed | Create/read/edit/restore profile, required fields and backend ownership |
| SF-05 | Completed | MongoDB catalog, separate unique game sections; Rocket League pilot only |
| SF-06 | Completed | Catalog-driven Rocket League context/options with backend checks |
| SF-07 | Completed | Manual details and both persistent images; validation and ownership tests |
| TF-01 | Completed | Feature branch/local commits, preserved identity, ignore rules, collaboration guide, existing Trello cards maintained |
| TF-02 | Completed | Integrated React/Vite and modular Express; startup/build/browser checks |
| TF-03 | Completed | Real MongoDB/Mongoose, indexes, disk persistence, schema history |
| TF-04 | Completed | Sessions/CSRF/hashes, owner-aware queries, successful and rejected cases |
| KF-01 | Partial | Team guide and real local workflow evidence prepared; actual teammate exercise/PR review pending |
| KF-04 | Partial | Models/indexes/validation/queries documented and tested; teammate setup exercise/results pending |

Trello: the selected existing cards progressed through Ongoing and Under Testing. The ten completed system/technical cards are Done; the two knowledge cards remain Under Testing with their outstanding exercises unchecked. None are Deployed. No invented dates, learning participants, reviews, meetings, or chart history were added.

## Demonstration and usability evidence

Follow the seven-step [README demonstration](../README.md#demonstrate-sprint-1). It reproduces the main journey with your own account; tests use isolated disposable accounts instead. Do not use a fake API response as evidence of integration.

Implemented examples: reusable labelled Field controls with descriptions/field errors, accessible alerts/status messages, busy/disabled submissions, connection retry, form input preservation, separate profile/game editing, contextual division fields, image constraints/feedback, responsive stacked forms/mobile navigation, and a keyboard skip link. These are implementation observations, not measured usability-study results.

Remaining acceptance outside this local work: real teammate guide/setup exercises, team walkthrough/review, and the owner's decision on sharing. Arabic UI translation/RTL acceptance, other browsers/physical devices, formal screen-reader checks, and human usability studies have not been performed. The product currently implements English/LTR with Arabic input support. Durable production media storage, password recovery, organizations, recruitment, notifications, verification/providers, and social functionality remain later backlog work.
