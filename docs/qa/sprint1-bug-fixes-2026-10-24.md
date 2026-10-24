# Sprint 1 code-review and bug-fix QA record

**Actual date:** 2026-10-24 (UTC; Asia/Riyadh is UTC+3). **Base:** `dc18e59ef0cb37a0d858f8a4d71ba94b7ffa73f0`. **Tested code/test commit:** `48b1e44a2721e2b9859378ad145ce46ac1627cee`. A later documentation-only commit adds this record and sanitized screenshots.

The base contains the merged language-picker/toast work (PR #4, `a234349`) and Nasser's password-recovery work (PR #5, `a4715c4`). Commit ancestry and the implementation were inspected. All three previously reported issues still reproduced; none was already resolved by those merges.

## Confirmed bugs and fixes

| Bug / verified story | Reproduction | Expected / actual before fix | Focused fix and result |
| --- | --- | --- | --- |
| QA-01 / SF-06 game-language form | Open the synthetic existing game described below; edit only availability and save. | Expected: save without dropping languages. Actual: a valid 114-character slash-separated value expanded to 128 characters and was rejected by both picker validation and API's 120-character limit. | Preserve the trimmed original compact value only when it is within 120 characters and represents the same language set. Picker and API share the formatter. Unrelated edits now save and retain every language; new/changed oversized values remain rejected. |
| QA-02 / SF-13 public profile | Save the maximum allowed display name, 50 consecutive `W` characters, and open its public link on desktop/mobile. | Expected: complete name visible. Actual: the public `h1` extended beyond its card and was clipped; only the owner's `h2` had wrapping rules. | Permit the name's flex item to shrink and wrap the public heading. The entire name stays inside its card at 1280, 412, 375 and 320px tested widths. |
| QA-03 / SF-13 public profile | Open `/p/not-an-id`, `/p`, `/p/`, or a public profile URL with an extra path segment. | Expected: public not-found state. Actual: malformed paths fell through to registration, or to the visitor's workspace when signed in. | Reserve the `/p` namespace and classify invalid IDs before loading profile data. Malformed and unknown public links now show **Profile not found.** Account and password-recovery routes remain separate. |

Story associations follow the existing [project handoff](../../RosterLink_Sprint1_Context_Handoff.md) and the merged PR scopes. This does not claim completion of SF-06's original game-specific rank catalogs or other deferred features.

The synthetic legacy value is:

```text
Arabic/English/Chinese/French/German/Hindi/Italian/Japanese/Korean/Portuguese/Russian/Spanish/Tagalog/Turkish/Urdu
```

## Actual testing and evidence

| Type | Scope and actual outcome |
| --- | --- |
| Before-fix reproduction | All six new browser checks failed on the latest merged implementation: each of the three bugs on desktop and mobile. These were expected baseline failures, not successful acceptance checks. |
| Unit | Shared normalization/legacy round-trip and public-URL classification tests pass. Empty selections, malformed paths, valid/uppercase IDs, and changed values exceeding the limit are covered. |
| Integration | **48/48 backend/domain tests passed** with `npm run check`. Tests use disposable MongoDB instances. Coverage includes authentication/session invalidation, ownership, profile/game/image persistence, public DTO privacy, and the legacy availability-only update. |
| Email adapter | Gmail transport options are tested with mock `createTransport`/`sendMail`. An additional API → account-token write → mail adapter → captured link → reset → new-password-login test passes entirely through a mock transport. Existing expiry, one-use/concurrent consumption, rate-limit, missing-provider, sanitized failure, CSRF and enumeration-response checks pass. |
| Functional / end-to-end | Final full-suite result is recorded below. Tests cover registration/login/logout, profiles/images, independent game/language values, competition fixtures/manual entries, success toasts, public pages, and captured-email recovery. |
| Negative / regression | Empty/oversized values, malformed/unknown profile IDs and unauthorized writes remain rejected. Existing core flows and recovery fragment scrubbing are retained. |
| Responsive | Automated desktop Chrome and Pixel 7 Chrome emulation; affected public-name checks also exercise 375px and 320px widths. Sanitized screenshots are linked below. |
| Production build | `npm run check` completed the Vite production build successfully. |

**Final browser suite:** **26/26 passed** with `npm run test:e2e -- --output .local-data/sprint1-qa/after-final` (3.1 minutes). The six previously failing checks all pass on the tested commit. The same commit passed all 48 backend/domain tests and the production build.

Sanitized post-fix visual evidence (synthetic data only): [desktop public name](../evidence/sprint1-fixes/public-name-desktop.png), [375px public name](../evidence/sprint1-fixes/public-name-mobile.png), [public not-found](../evidence/sprint1-fixes/public-not-found.png), [legacy language save on mobile](../evidence/sprint1-fixes/legacy-language-mobile.png).

Source evidence: [unit normalization](../../tests/languages.test.js), [route unit test](../../tests/public-profile-route.test.js), [API regression](../../tests/integration.test.js), [mock-mail integration](../../tests/password-reset.test.js), [new UI regressions](../../tests/browser/profile-edge-cases.spec.js), [existing recovery UI](../../tests/browser/password-reset.spec.js).

Local logs/artifacts are ignored rather than committed: `.local-data/sprint1-qa/before.log`, `check-final.log`, `e2e-final.log`, `before/`, and `after-final/`. Reproduce with `npm run check` and `npm run test:e2e`; MongoDB 8.0.17 and installed Chrome are required as documented in the README.

Two test-harness issues were corrected without weakening application checks: the new integration case now owns a separate application/rate-limit budget; the pre-existing browser image assertion now polls for actual completion instead of checking immediately after visibility. The initial combined integration run hit 429 from shared test traffic (47/48 passed), and the first full browser run hit the immediate image assertion (25/26 passed). Final results above supersede those runs; they are retained in local logs for traceability.

## Environment, preservation and limitations

The existing server-only adapter recognizes `GMAIL_APP_PASSWORD`, or all of `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN`. Variable names and the presence of a recognized local setting were inspected; secret values were not printed, copied into source, or committed. No real SMTP authentication/delivery was attempted in this QA run, and no real recipient was authorized. The tests and local demo use captured/mock mail only. Live Gmail/OAuth2 delivery and live competition-provider coverage are not acceptance claims here.

Existing `.env`, credentials, uploads and development database files were preserved. Tests and demo use separate disposable databases, never the configured application database. No destructive migration, seed of development data, reset, deployment, auto-merge or Trello update is part of this change.

The interface remains English; language choices are profile data, not a translated UI. Browser coverage is Chrome and mobile emulation, not physical-device, cross-browser, screen-reader or real-user usability testing. The known SF-08 public-field visibility limitation remains outside these fixes.

## Team walkthrough — separate record

These findings were identified during code review and reproducible automated testing. No team-walkthrough notes or confirmation were supplied. No meeting, participant list, discussion outcome or historical walkthrough date is asserted. A future real walkthrough should be recorded separately with its actual notes and date; it is not interchangeable with this automated/code-review evidence.
