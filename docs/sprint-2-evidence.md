# Sprint 2 evidence — organizations and recruitment

For the new full verification performed during publication preparation, see [Sprint 2 PR verification — October 31](qa/sprint2-pr-verification-2026-10-31.md). Historical results below remain separate from the current run.

## Follow-up: structured schedule picker — October 31, 2026

User requested choosing availability from a table to avoid inconsistent free-text schedules. Replaced the opening's Schedule textbox with a responsive, labelled weekly table: select days and choose From/To times in 15-minute increments, retaining the explicit schedule timezone. One block per selected day is supported. Earlier end times finish the following day, with a visible explanation. The API requires structured `scheduleSlots`, validates allowed days/times and rejects empty selections, duplicate days, equal start/end times, overlapping intervals (including the Saturday/Sunday boundary), extra properties and free-text schedule writes. MongoDB stores both the structured values and a server-generated ordered summary.

Implementation commit: `e32241c06b2577de62ed11e553e14d9b19faaa3b`.

Existing text-only schedules remain readable and untouched. When editing an old opening, its prior schedule is shown; the manager explicitly chooses days/times before saving. No local user data was reset or migrated. Updated recruitment browser journeys select the table, verify values on edit, save, refresh and check persisted slots/overnight summaries. The existing running app at `http://127.0.0.1:5173` serves the change; health responds 200.

Verification on October 31:

- `npm run check`: **60/60 tests passed**, then production build passed (34 modules; 231 ms build). Log `.local-schedule-check.log`.
- `npm run test:e2e -- tests/browser/recruitment.spec.js`: **4/4 passed**, desktop 2/2 (15.6 seconds), mobile 2/2 (16.4 seconds). Log `.local-schedule-browser.log`. Regenerated editor, team and filtered-result screenshots below; visually inspected the mobile table and verified no overflow using existing screenshot assertions.
- API integration adds normalization, invalid-slot, overlap, legacy-record-read and explicit upgrade checks. The other 59 backend/domain tests also pass. The full 30-case browser regression result below is from October 30; this follow-up reran the four affected browser checks rather than claiming a fresh full-browser run.
- Files: `shared/schedule.js`, `client/SchedulePicker.jsx`, `client/Recruitment.jsx`, `client/styles.css`, recruitment models/routes, API/browser tests, README/data-model/architecture documentation and affected screenshots. No account/profile/recovery behavior changed. One daily time block and 15-minute granularity are current limits; recurring calendar/DST automation is outside scope.

The October 30 record below is historical; its free-text schedule description is superseded by this follow-up.

Sprint: **October 28–November 4, 2026**. Actual local implementation/verification: **October 30, 2026**, Asia/Riyadh. This records observed local results, not a deployment or team contribution claim. Trello was not changed.

## Baseline and preservation

- Supplied workspace was empty and not a Git repository. Cloned the existing repository into its `RosterLink/` directory; inspected clean `main`, remotes, and history, then fetched origin and created `feature/sprint-2-organizations-recruitment` from `origin/main` at `3fc329d`. Machine-specific absolute paths are omitted from this published record.
- Read README, CONTRIBUTING, architecture/data-model documents, Sprint 1 evidence, dated Sprint 1 fixes and relevant implementation/tests. No repository or workspace/parent `AGENTS.md` was present. `.agents/qa-project-context.md` was absent.
- Base includes teammate language/toast UI, public sharing, legacy-language/public-route fixes, and password recovery. Reused existing React/Vite, Express, Mongoose, catalog, session/CSRF/origin protection, labelled field/notice/loading controls, success toasts, and responsive styles.
- Also inspected a separate existing local checkout: clean `feature/SF-03-forgotten-password` at `a4715c4`. That commit is an ancestor of this latest-main base. Did not modify its branch, files, ignored environment, media or database.
- Trello board/card URLs could not be read through the web tool. The user's explicit SF-14/15/18/19/20/21 requirements were the implementation contract. No push, PR, merge, deployment, Trello update or external-provider integration occurred.

## Story behavior and actual status

**Completed locally** means the requested acceptance checks passed, including real MongoDB/API tests, desktop/mobile browser flows and Sprint 1 regressions. It does not mean deployed, reviewed by the team, or changed to Done on Trello.

| Story | Implemented behavior | Actual status / acceptance evidence |
| --- | --- | --- |
| [SF-14](https://trello.com/c/583DcGr2) | Signed-in user creates an organization with name, description, region and optional HTTP(S) website. Creator automatically manages it. Authorized edit; persistent public read-only page. Player profile optional. | **Completed locally**; strict input/privacy/auth/persistence API checks and desktop/mobile UI create/edit/public/refresh/new-login pass. |
| [SF-15](https://trello.com/c/ithQewxk) | Organization managers add teams referencing one parent organization and an enabled catalog game. Public team page; scoped name/description edit. Parent/game immutable. | **Completed locally**; parent/game and scope/API checks pass; two game teams and public team page verified in browser. |
| [SF-18](https://trello.com/c/lzgyfsd0) | Assign/revoke organization-wide and team-scoped managers by registered email. Backend checks current MongoDB membership each request. No global role. Atomic last-manager protection, including concurrent removals. | **Completed locally**; two organizations, sibling restrictions, escalation, both revocations and concurrent guard pass; browser verifies role UI and stale-session denial. |
| [SF-19](https://trello.com/c/z4S0SINS) | Organization/team managers publish, edit and close their team's openings. Idempotent closure preserves record and actor/time; closed records cannot edit/reopen. Unauthorized writes rejected. | **Completed locally**; lifecycle/security API tests and desktop/mobile publish/edit/close/history-detail journey pass. |
| [SF-20](https://trello.com/c/uXIViS3g) | Required role/platform/game-specific requirements/region/schedule/language/timezone/deadline; optional rank/context. Game derived from team. UTC deadline storage, local entry/display, explicit schedule timezone. | **Completed locally**; valid form persists in browser; invalid fields, impossible/past/offsetless dates and injected game/status/team rejected by API. |
| [SF-21](https://trello.com/c/r3FGKgYb) | Public/player active list and details; AND filters by game and literal role/region/language substrings; closed/expired excluded; loading, empty, error/retry and validation states. | **Completed locally**; filtering/exclusion/invalid-query API tests pass; desktop/mobile filtered details, empty, loading, errors and retry verified. |

## Changed files and implementation commits

Implementation commits:

- `ce888e5b0f2f9d260f94081cf7dad05ac2a5cd7b` — all six stories, API/security/restart tests, browser journeys and per-device test isolation.
- `7fbc681d9e77fe63a868c6a1b4063fdb26d120b2` — prevent Revoke button text wrapping on narrow role-management rows; focused browser checks and build rerun after this visual polish.

Evidence commit follows implementation so the actual implementation SHAs can be recorded without a self-referential hash. Use `git log --oneline origin/main..HEAD` for the full local commit list. Local implementation commits identify the automated author as Codex; this is not an attribution of work to any team member.

| Files | Change |
| --- | --- |
| `server/modules/recruitment/models.js` | Additive Organization, Team and Opening schemas, references, constraints and indexes |
| `server/modules/recruitment/routes.js` | Public pages/list filters; management queries; strict validation; backend organization/team authorization; grant/revoke guard; opening lifecycle |
| `server/app.js`, `server/index.js` | Mount routes after existing session/CSRF middleware; initialize new indexes before API startup |
| `client/Recruitment.jsx` | Organization/team public pages; management forms/roles; opening editor, detail and browse/filter UI |
| `client/App.jsx`, `client/main.jsx`, `client/styles.css` | Entry links and URL routing; reuse existing workspace/UI; responsive recruitment layout |
| `tests/recruitment.test.js` | Eleven original real-MongoDB API/security/lifecycle/filter/persistence scenarios; twelve after the structured-schedule follow-up |
| `tests/browser/recruitment.spec.js` | Desktop/mobile real UI journeys, role revocation with stale UI, validation, retry and screenshots |
| `scripts/e2e-api.js` | Initialize new model indexes in isolated browser test API |
| `scripts/run-browser-tests.js`, `package.json` | Run device projects in separate API/database lifecycles; preserve unchanged production authentication rate limits and forward test filters |
| `README.md`, `docs/architecture.md`, `docs/data-model.md` | Local demo, API contract, permission/date rules and additive schema documentation |
| `docs/sprint-2-evidence.md`, `docs/evidence/sprint-2/*.png` | This record and sanitized desktop/mobile screenshots |

No dependencies, account/authentication/profile/media/recovery implementation or provider adapter changed. No destructive migration is needed.

## Exact commands and actual results

All commands run from the repository root in Windows PowerShell, Node **24.18.1**, npm **11.16.0**. API/browser tests use real isolated **MongoDB 8.0.17** processes; no development database or user data is seeded or reset. Browser tests use installed Google Chrome and Pixel 7 Chrome emulation.

| Command | Actual result |
| --- | --- |
| `git status --short --branch`; `git log -5 --oneline`; `git remote -v`; `git fetch origin` | Clean cloned main at `3fc329d`, origin matches requested repository. |
| `git switch -c feature/sprint-2-organizations-recruitment origin/main` | Local feature branch created from latest main. |
| `npm ci` | Success; 210 packages installed; audit reported 0 vulnerabilities. No dependency changes. |
| `node --test tests/recruitment.test.js` | **11/11 passed**, 0 failed. First run included 755.6 MB MongoDB binary download. Full suite reruns these tests. Log: `.local-recruitment-test.log`. |
| `npm test` | **59/59 passed**, 0 failed (48 existing + 11 Sprint 2). Final standalone rerun: 18.8 seconds, `.local-full-test-final.log`. |
| `npm run check` | **Passed**, all 59 tests then production build, failure propagation intact. Final log: `.local-final-check.log`; tests 20.3 seconds, Vite build 138 ms. |
| `npm run build` | **Passed** Vite production compilation after final CSS polish: 32 modules, CSS 21.63 kB and JS 280.36 kB (84.50 kB gzip), 176 ms. Log `.local-final-build.log`. Also passed through `npm run check` before CSS-only polish. |
| `npm run test:e2e -- tests/browser/recruitment.spec.js` | **4/4 passed** after final CSS polish: desktop **2/2** (16.3 seconds), mobile **2/2** (17.2 seconds). Final screenshot log: `.local-recruitment-browser-final-screenshots.log`. Earlier focused pass: 4/4 in 27.4 seconds, `.local-recruitment-browser-acceptance.log`. Full regression also includes these four checks. |
| `npm run test:e2e` | **30/30 passed**, 0 failed: desktop **15/15** (52.5 seconds), mobile **15/15** (about 1.5 minutes), including all 26 existing Sprint 1 and 4 Sprint 2 browser cases. Log: `.local-full-browser-final.log`. |
| `git diff --check` | Passed; no whitespace errors. |

Local logs, downloaded database binaries, test databases, Playwright traces/reports and `dist/` are ignored. Screenshots below are intentionally tracked evidence. Test passwords/accounts are synthetic and isolated; no real SMTP/provider calls are made. Existing recovery tests use the existing injected/captured mail transport.

### Failures and corrections

- First focused browser run: **2 passed / 2 failed**, both complete-journey cases stopped at an exact-text email assertion. Snapshot confirmed successful persisted grant; the email shares its node with a scope label. Changed the assertion to the specifically named Revoke button.
- Next run found an exact required-field label selector waiting on `Role` while the label text includes a required marker. Changed new opening form selectors to account for the shared Field component's required marker. Interrupted this obsolete run before waiting for the same selector on mobile. No API acceptance assertion was weakened.
- A screenshot cleanup helper initially captured indexed toast locators before dismissing them; removing a toast shifted those indexes. Replaced it with the existing Escape-to-dismiss behavior. Final screenshots click the page heading to blur inputs and capture from the top, avoiding offscreen fixed skip-link artifacts in full-page screenshots.
- First combined full browser run: **27 passed / 3 failed**, all three failures were HTTP 429 authentication responses late in the mobile project. Desktop/mobile were sharing one API process and the unchanged 30-auth-attempts/IP/15-minute budget. Added a small Node runner that restarts the existing Playwright API/MongoDB lifecycle between device projects. No application auth/session/password-reset implementation or rate limit was weakened. Rerun results supersede this run; original log `.local-full-browser.log` is retained locally.
- Chrome/Playwright prints harmless NO_COLOR/FORCE_COLOR warnings. npm reports the MongoDB package's postinstall is not allowlisted; the binary downloaded successfully at test runtime.

## Opening lifecycle test cases

These results are assertions in `tests/recruitment.test.js`, run against Express/session/CSRF/MongoDB together. The browser journey independently repeats publish → edit → refresh → browse/filter → detail → revoke → close.

| Case | Action / input | Expected | Actual |
| --- | --- | --- | --- |
| OL-01 | Organization manager publishes valid team opening | 201, active record, persistent fields | Pass: 201, schema validated |
| OL-02 | Assigned team manager publishes own team opening | 201; game copied from team | Pass; game equals team game |
| OL-03 | Deadline `2099-11-04T23:59:00+03:00` | Store exact UTC instant | Pass: `2099-11-04T20:59:00.000Z` |
| OL-04 | Scoped manager edits role/requirements | 200; public reread reflects edit | Pass; changed role returns |
| OL-05 | Blank role/requirements, oversized requirements/rank, invalid platform | 400; no invalid record persisted | Pass; count unchanged |
| OL-06 | Blank region, language, schedule; invalid timezone | 400 | Pass; no invalid record |
| OL-07 | Past, impossible, malformed or offsetless deadline | 400 | Pass for all variants |
| OL-08 | Submit client game, gameId, team, status or createdBy | 400; no ownership/game override | Pass |
| OL-09 | Anonymous publish/edit/close with visitor CSRF | 401; no change | Pass |
| OL-10 | Missing CSRF / foreign origin | 403 before write | Pass on representative organization writes; existing CSRF regression suite also passes |
| OL-11 | Other organization's manager edits/closes opening | 403; record unchanged | Pass |
| OL-12 | Team manager publishes/edits unrelated sibling/other-org team | 403 | Pass |
| OL-13 | Revoke team manager, reuse same authenticated session | Subsequent publish/edit/close fail 403 | Pass immediately; management list empty |
| OL-14 | Organization-wide manager manages a sibling team | Allowed; revocation removes access | Pass |
| OL-15 | Close opening | 200, closed record retained, closure actor/time | Pass; MongoDB record and public detail retained |
| OL-16 | Close same opening twice | Idempotent; original closure time retained | Pass |
| OL-17 | Edit/reopen closed opening | 409; remains closed | Pass |
| OL-18 | Active list after close | Closed record excluded | Pass |
| OL-19 | Deadline elapsed (test fixture moves stored deadline to past) | Active lists exclude; detail marked expired; manager history retains | Pass on browse/team/management/detail APIs |
| OL-20 | Combine game, role, region, language filters | Only matching active opening | Pass; one expected ID |
| OL-21 | Search role `.*` or `[unique]` | Literal text, no regex execution | Pass; empty / one expected result |
| OL-22 | Invalid ObjectId, empty/oversized filter, injected query operator | 400; safe field feedback | Pass |
| OL-23 | Unknown/malformed opening ID | 404 | Pass |
| OL-24 | Stop/start MongoDB; new login; read and edit opening | Organization/team/role/data retained | Pass after actual WiredTiger restart |
| OL-25 | Concurrent removal of two organization managers | Exactly one successful removal; one manager remains | Pass; other request rejected with 403 or 409 depending ordering |

## Reproducible two-organization demonstration

Use README setup (`npm ci`, `npm run setup:local`, `npm run db` in one terminal, `npm run seed`, `npm run dev` in another). Use the enabled local game catalog; `npm run sync:games` is optional existing functionality, not required for this sprint. For a no-provider two-game catalog use the existing browser test harness, which seeds Rocket League and local Valorant fixtures.

1. Register four different accounts in separate browser profiles/contexts: **A-owner**, **B-owner**, **A-org-manager**, **A-team-manager**. Names describe demo roles only; use your own registered emails. No responsible team member is implied. A user need not create a player profile to manage an organization.
2. A-owner opens `/manage`, creates **Falcons** (name, description, Saudi Arabia), then adds **Falcons Rocket League** under Rocket League and a second team (Valorant if available; otherwise another team under the seeded game). Inspect the public organization link and team links in a signed-out context; they are read-only and contain no manager emails.
3. B-owner creates **Wolves**, adds **Wolves Rocket League**. This is a separate organization under another account. A-owner and B-owner cannot edit each other's organization/team/opening IDs.
4. A-owner enters A-org-manager's registered email with **Organization-wide** scope. Assign A-team-manager to **Falcons Rocket League** only. The role list displays both scopes. Attempt to assign a nonexistent email; expect useful feedback.
5. A-org-manager can edit Falcons and manage either Falcons team and roles. A-team-manager's `/manage` shows Falcons Rocket League only, without role management. Attempt direct writes to the sibling/Wolves team IDs with that logged-in session; expect 403. The automated API tests reproduce these attacks without relying on hidden UI.
6. A-team-manager publishes **Rotation player**, platform PC, requirements `Rocket League 3v3 rotation and replay reviews`, rank/context `Champion II`, region Middle East, language Arabic / English, schedule `Sun–Thu 20:00–23:00`, timezone Asia/Riyadh, and a future local deadline. Game is derived and cannot be selected independently. Edit requirements; refresh, then log out and log back in. Saved opening/team/organization values remain.
7. In a guest/player context open `/openings`; filter game Rocket League, role Rotation, region Middle East, language Arabic. Open matching detail, team and organization links. Clear/change filters to see the empty state. Break API connectivity and retry to see connection feedback (automated browser test uses a network abort, not fake successful data).
8. A-owner revokes A-team-manager while their management page remains open. The stale page's next Close/Edit/Publish request fails 403. Revoking A-org-manager similarly removes organization-wide access. Trying to revoke the final organization manager returns 409.
9. A-owner closes the opening. It disappears from active filtered and team lists; its public detail shows Closed and manager history retains it. Editing/reopening returns 409; closing again preserves the original closure time.
10. Expiry is based on server time, not a cleanup job. For a quick reproducible expiry check run `node --test tests/recruitment.test.js`; the isolated fixture sets a stored deadline into the past and asserts immediate active-list exclusion plus retained expired detail/history. Past deadlines cannot be submitted via production create/edit forms.

Automated reproduction: `npm run test:e2e -- tests/browser/recruitment.spec.js` creates two independent organizations plus a team-scoped account, drives the UI, and disposes the isolated database on teardown. `node --test tests/recruitment.test.js` also includes the extra organization-wide user, concurrency, expiry and database-restart scenarios.

## Screenshot paths and visual checks

Synthetic accounts and organizations only. Screenshots are generated by the real browser journey against React → Express → MongoDB, not static mockups. Desktop and mobile screenshot paths:

| View | Desktop | Mobile |
| --- | --- | --- |
| Organization page | [organization](evidence/sprint-2/desktop-chrome-organization.png) | [organization](evidence/sprint-2/mobile-chrome-organization.png) |
| Team page and active opening | [team](evidence/sprint-2/desktop-chrome-team.png) | [team](evidence/sprint-2/mobile-chrome-team.png) |
| Roles and game-specific teams | [roles/teams](evidence/sprint-2/desktop-chrome-roles-and-teams.png) | [roles/teams](evidence/sprint-2/mobile-chrome-roles-and-teams.png) |
| Opening creation | [opening editor](evidence/sprint-2/desktop-chrome-opening-creation.png) | [opening editor](evidence/sprint-2/mobile-chrome-opening-creation.png) |
| Filtered results | [filtered openings](evidence/sprint-2/desktop-chrome-filtered-openings.png) | [filtered openings](evidence/sprint-2/mobile-chrome-filtered-openings.png) |

Visually inspected organization/team pages, management roles, opening editor and filtered results across desktop/mobile captures. New UI follows the existing green/lime palette, typography and card styling; forms stack on mobile, long names/emails wrap, and Revoke labels stay intact. Browser assertions at every captured view confirm no horizontal overflow. The main workspace page's captured uncaught-error list was empty. Screenshot names represent the device configuration; mobile auxiliary user contexts explicitly use the same viewport/touch/mobile settings as the main test page.

## Remaining issues and limitations

- No known blocking issue remains in the requested local acceptance scope. Actual team review and Trello status decisions are separate and remain unperformed.
- Lists are unpaginated. Organization/team manager references are arrays suitable for this sprint's scale; high-volume membership/list pagination and operational limits need later work.
- Requirements are manual game-specific text, shared platform choices, and optional rank/context. No authoritative per-game role/rank catalog or verification provider is claimed. Region/language filters are literal text matching, not language-code taxonomy or fuzzy search.
- Schedule is descriptive recurring availability text plus a validated timezone; no calendar, recurring-event parser or DST scheduling engine. Deadlines use the application server clock. Closed/expired public detail remains readable; only active lists suppress it.
- Authorization is evaluated per request; revocation blocks subsequent requests without requiring logout. An already-authorized in-flight operation is not globally cancelled by a concurrent revocation.
- Automated Chrome desktop and mobile emulation only; physical devices, other browser engines, assistive technology and human usability/team review were not performed. English interface with Unicode/Arabic data, consistent with Sprint 1.
- Existing production concerns remain: durable media/database backups, operational scaling/rate limiter, and real SMTP/provider verification are outside this sprint. No real email or external integration was used.
- No applications, tryouts, notifications, social posts or external-provider integration added. No team review, contribution allocation, Trello status or deployment is implied.

## Suggested Sprint Review table

This is a proposed review agenda, not a record of a meeting. Responsible team members intentionally remain unassigned.

| Story / review item | Demonstration | Evidence to inspect | Responsible team member | Review decision |
| --- | --- | --- | --- | --- |
| SF-14 organization | Create/edit Falcons; open public link | Organization screenshots, strict validation, persistence tests | Unassigned | Pending team review |
| SF-15 game teams | Two teams under Falcons; parent/game fixed | Team screenshots, parent/game/API tests | Unassigned | Pending team review |
| SF-18 scoped roles | Grant both scopes, attack sibling/Wolves, revoke, protect last manager | Roles screenshots, backend permission/concurrency checks | Unassigned | Pending team review |
| SF-19 lifecycle | Publish → edit → close; retained detail | Browser journey, OL-01/04/11–18 | Unassigned | Pending team review |
| SF-20 requirements | Validate fields and timezone; inspect UTC deadline | Opening editor screenshots, OL-03/05–08 | Unassigned | Pending team review |
| SF-21 discovery | Combine filters; empty/error/retry; closed/expired absent | Filter screenshots, OL-18–23 and browser state checks | Unassigned | Pending team review |
| Sprint 1 regression | Account/profile/images/public sharing/recovery unchanged | Full API/browser regression and production build | Unassigned | Pending team review |
| Limitations / next sprint | Review scale, supported environments and deferred scope | Remaining limitations above | Unassigned | Pending team review |
