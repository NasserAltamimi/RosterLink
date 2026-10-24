# Sprint 1 architecture and API

JavaScript modular monolith: **React/Vite → Express → MongoDB/Mongoose**. `client/` owns presentation/API calls. Backend modules cover `auth`, `profiles`, and `games`. `server/storage/local-images.js` isolates media storage. Credentials and persistence stay on the backend.

## Session decision

`express-session` stores an opaque signed ID in `rosterlink.sid`; session data is in MongoDB through `connect-mongo`. The cookie is HTTP-only, SameSite=Lax, expires after seven days, and is Secure in production. Registration/login regenerate the session and CSRF token. Refresh reads the server session; no auth token is kept in localStorage. Logout destroys the session and clears the cookie. Replaying it fails.

MongoDB application writes and session saves request journal acknowledgement (`w:1,j:true`). Session touches are throttled to one hour to avoid rewriting unchanged sessions on every image/API read. Session saves still occur on changes.

Passwords use asynchronous Node scrypt: random 16-byte salt, N=32768, r=8, p=1, 64-byte key, timing-safe comparison. Wrong-password and absent-account login messages match; absent accounts still perform dummy scrypt verification. Auth attempts and API traffic are rate-limited per IP. Limiter state is process-local for this single-process sprint; scaling needs a shared limiter store.

`GET /api/auth/session` returns a synchronizer token. Every non-read API request, including registration/login/logout, needs `X-CSRF-Token`. If supplied, Origin must match `APP_ORIGIN`. Authentication rotates the token; stale-token errors instruct a refresh. Errors expose safe messages/field errors, never stack traces, hashes, or request bodies. Helmet supplies security headers, and API responses are no-store.

## API contract

SF-03 adds forgotten-password requests and single-use resets, hashed expiring tokens, and account-version revocation of every prior session. See [password recovery](password-recovery.md) for the API, atomic-write design, Gmail configuration, and delivery/rate-limit boundaries.

JSON bodies except multipart image uploads. Errors: `{message,fields?}`. Another owner's profile ID returns 404. Profile and image routes are private in Sprint 1.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Database connectivity |
| GET | `/api/auth/session` | Current `{id,email}` or null; CSRF token |
| POST | `/api/auth/register` | `{email,password}`; account and session |
| POST | `/api/auth/login` | `{email,password}`; fresh session |
| POST | `/api/auth/logout` | Destroy session; 204 |
| GET | `/api/games` | Enabled catalog configurations |
| GET | `/api/profiles/me` | Own profile/sections or null |
| POST | `/api/profiles` | Create own profile once |
| GET / PUT | `/api/profiles/:profileId` | Read/edit own general profile |
| POST | `/api/profiles/:profileId/games` | Add `{gameId,details}` |
| PUT | `/api/profiles/:profileId/games/:gameId` | Replace `{details}` |
| DELETE | `/api/profiles/:profileId/games/:gameId` | Remove section |
| GET / POST / DELETE | `/api/profiles/:profileId/images/:kind` | Read/upload/remove `profile` or `header` image |

General input: `{displayName,bio,region,languages:[]}`. Unknown keys are rejected. Game options are validated against the selected enabled MongoDB configuration. Internal game IDs differ from slugs and future provider IDs. Section source is fixed to `self_reported`.

## Images

Authentication/ownership checks precede multipart parsing. Accept one `image` part, maximum 5 MiB. JPEG/PNG/WebP MIME must match a valid decoded format. Sharp rejects corrupt, animated/multi-page, or over-20-megapixel inputs, strips metadata, rotates/resizes, and re-encodes WebP. Random keys replace client filenames. There is no static upload directory; all reads require ownership. Authenticated `sendFile` explicitly permits the ignored `.local-data` directory, using a generated validated key rather than a client path.

Replacement/removal cleans up the previous file. Missing media returns 404. Disk and MongoDB are not transactional together: a crash between save/reference update can leave orphaned files, and a cleanup failure can return an error after an update. A future maintenance job can reconcile orphans. Production storage needs durable backups; replace the small `save/path/remove` boundary when introducing object storage.

## UI and localization

Reusable Field/Notice/Submit/Loading components provide labels, field errors, status announcements, and pending states. One `LanguagePicker` (Arabic / English / Other) serves both the profile languages and each game's communication languages, with rules shared in `shared/languages.js`. Successful saves, removals, registration, login and logout show a dismissible top-right success toast (`client/Toasts.jsx`) from one polite live region; errors and field validation stay inline. Failed saves retain edits. Responsive layouts stack on mobile. English/LTR is implemented; Arabic text uses `dir="auto"` and spacing uses logical properties. Full Arabic translation/RTL acceptance remains future work.

## Future boundaries

- Organizations: one parent with game teams; organization/team-scoped memberships, no global recruiter flag. The same user may have a player profile and memberships.
- Recruitment: separate openings/applications/tryouts with actor/time for transitions; protect private notes from applicants/unrelated organizations.
- Notifications: independently growing user/event-linked records.
- Verification/integrations: backend adapters with provider ID, source URL, last successful retrieval, and linkage/review status. Distinguish tournament facts from participation/placement claims and consider historical memberships. Retain permitted cached data with honest freshness; outages must not stop core flows.
- Social/moderation: separate posts/interactions/reports, not unlimited organization arrays.

No premature models or empty future service layers were added. Liquipedia access remains unconfirmed; the optional PandaScore access probe is not a completed product integration or identity-verification feature.
