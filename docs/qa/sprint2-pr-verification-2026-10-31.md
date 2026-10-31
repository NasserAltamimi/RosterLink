# Sprint 2 pull request verification — October 31, 2026

Sprint: **October 28–November 4, 2026**. Scope: **SF-14, SF-15, SF-18, SF-19, SF-20, SF-21**. This is a new verification run for PR preparation, separate from the original October 30 run and the earlier October 31 schedule follow-up.

## Code and synchronization

Tested application/test commit: `576681747f85c49d96f7756159b017a48bf5d8c6`. Base: `3fc329df9fc9d872ba7829b7be69685143ebecfb` (`origin/main`). The latest main was fetched before verification and was already an ancestor of this feature branch; no integration merge or conflict resolution was needed. Later publication-preparation changes only update documentation and intentionally refreshed synthetic screenshots, not application/test behavior.

## Current verification

Environment: Windows PowerShell, Node 24.18.1, npm 11.16.0, real isolated MongoDB 8.0.17, installed Chrome desktop and Pixel 7 Chrome emulation. All commands run from the repository root. Development accounts, sessions, media and database are not reset by the tests.

`npm run check` passed: **60/60 backend/domain tests**, zero failed/cancelled/skipped, then a successful Vite production build. This includes the existing Sprint 1 regressions and 12 Sprint 2 scenarios, including structured schedules, backend permission attacks, role revocation, concurrent last-manager protection, retained closure, expired-opening filtering and a real MongoDB restart/new-login persistence check.

Saved backend/build log: `.local-pr-check-2026-10-31.log` (ignored local artifact). Exact result excerpt:

```text
ℹ tests 60
ℹ pass 60
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 66704.7596

✓ 34 modules transformed.
dist/index.html                   0.50 kB │ gzip:  0.32 kB
dist/assets/index-VPpxA85n.css   22.54 kB │ gzip:  5.57 kB
dist/assets/index-C4DwOw8J.js   283.02 kB │ gzip: 85.41 kB
✓ built in 652ms
```

`npm run test:e2e` passed: **30/30 browser checks**, desktop **15/15** and mobile **15/15**, with both processes exiting 0. These include all 26 existing Sprint 1 browser cases plus the four Sprint 2 cases. Each device uses a fresh API/database so the production authentication rate limit remains unchanged. Saved browser log: `.local-pr-browser-2026-10-31.log` (ignored local artifact).

```text
Browser verification: desktop-chrome (fresh API and database).
Running 15 tests using 1 worker
15 passed (2.2m)

Browser verification: mobile-chrome (fresh API and database).
Running 15 tests using 1 worker
15 passed (2.2m)
```

The full browser journeys verify organizations, game teams, role assignment/revocation, opening publish/edit/close, structured schedule restoration, filtering, public pages, refresh and a new login. Negative cases include anonymous access, stale revoked-manager requests, invalid input, empty states and failed-connection retry. The backend suite additionally covers cross-organization attacks, sibling-team restrictions, invalid/past/impossible deadlines, closed/expired records and legacy-schedule conversion. Test screenshots in `docs/evidence/sprint-2/` were refreshed with synthetic data during this run; the original October 30 textual test results remain preserved separately.

No runtime or test changes were needed after these successful runs. Documentation privacy cleanup and screenshot refresh were reviewed separately with `git diff --check`.

## Publication review and boundaries

Reviewed the diff against main, changed-file history, application/test code and evidence. No `.env`, real secrets, uploads, database files, dependency directories, production build output, raw traces or private account/session data are included in the PR. Test credentials are explicit disposable fixtures; screenshots show synthetic organizations and `example.com` accounts. A targeted token/private-key/credential-URI scan of changed text files found no matches. `.env` remains ignored and untracked. Machine-specific absolute paths were removed from the Sprint 2 evidence document before publication.

The pre-existing untracked October 30 testing-summary PNG is preserved locally and excluded from the PR. Existing reports keep the original **59 tests / 30 browser checks** separate from the earlier schedule follow-up's **60 tests / 4 affected browser checks** and from this new full verification.

Ali's reviewer account resolves to **`MHWS7`**: the GitHub-linked author of commits in PR #6, also a requested reviewer on PR #5, with confirmed repository write permission. Reviewer-request status is reported by the PR itself; resolving the account is not a claim that a review has happened.

Local acceptance does not establish completed team review, merge or deployment. Lists remain unpaginated; schedules support one block per day in 15-minute increments, with explicit IANA timezone and overnight support. Legacy text schedules remain readable and require explicit structured selection on edit. No calendar/DST automation, physical-device/cross-engine usability study, application submission, tryouts, notifications, social posts, or new external-provider integration is included. No real SMTP/provider delivery is claimed.
