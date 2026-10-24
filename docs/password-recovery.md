# SF-03: forgotten-password reset

Story: https://trello.com/c/AGB3PjYx. Implementation stays in the existing React/Express/MongoDB architecture and account screen styles. The card could not be fetched through the available web tool; the supplied story requirements define this change. No Trello status was changed.

## Gmail setup

The server-only Nodemailer adapter connects to `smtp.gmail.com:465` with TLS and certificate verification. Both authenticated user and sender are fixed to `rosterlink0@gmail.com`. The sender address does not supply authorization to its mailbox. Existing `.env` values are left untouched.

Google's official documentation was checked on 2026-10-24:

- [Gmail IMAP/SMTP authentication](https://developers.google.com/workspace/gmail/imap/imap-smtp): Gmail supports OAuth 2.0 through SASL XOAUTH2, and SMTP over TLS.
- [Google app passwords](https://support.google.com/accounts/answer/185833): app passwords require 2-Step Verification; availability depends on account settings. Google recommends OAuth-based sign-in when available.
- [Nodemailer OAuth2 configuration](https://nodemailer.com/smtp/oauth2): the transport refreshes access tokens using the supplied client ID, client secret, and refresh token.

Choose one configuration in the ignored root `.env` or server environment:

1. OAuth2: set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`. The refresh token must be authorized by the sender account for the `https://mail.google.com/` scope. Configure the OAuth consent/client in Google Cloud and obtain offline consent using your approved OAuth setup. The adapter refreshes access tokens automatically.
2. App password: enable 2-Step Verification for the sender account, create an app password in Google Account settings, and set `GMAIL_APP_PASSWORD`. Paste the generated value without display spaces. This option takes precedence if both methods are configured. A normal Google account password is not supported by this adapter's setup.

Never prefix these variables with `VITE_`, commit them, or include them in logs. Restart the API after changing configuration. `APP_ORIGIN` must be a trusted HTTP(S) origin with no path or trailing slash, such as `http://127.0.0.1:5173` locally, and must use HTTPS in production. The request Host header never supplies email links.

Local Gmail app-password configuration is now present in the ignored `.env`. SMTP connection/authentication succeeded during diagnostics, and the owner subsequently confirmed that real password-recovery email delivery works. Without configuration, requests for every address return the same 503 unavailable message. Other environments must supply their own server-side credentials and restart the API.

## User flow and API

`/login` includes **Forgot password?**, opening `/forgot-password`. Requests show pending, accepted, validation, rate-limit, connection, and service-unavailable states. An accepted request says an active account will receive a link; it does not claim that SMTP delivery succeeded. `/reset-password#<secret>` checks the link before showing password and confirmation fields, distinguishes expired from invalid/used links, and provides a new-link action. Successful reset redirects to `/login?passwordReset=success`; it never signs the user in automatically.

The fragment stays off HTTP request URLs and Referer headers. The client removes it from the visible URL/history immediately and retains it only in memory. Reloading the scrubbed page requires reopening the email link. Opening another reset link in the same tab rechecks it.

| Method | Endpoint | Body and behavior |
| --- | --- | --- |
| POST | `/api/auth/forgot-password` | `{email}`; 202 and identical message for active, unknown and disabled accounts |
| POST | `/api/auth/reset-password/validate` | `{token}`; checks without consumption; 400 invalid/used, 410 expired |
| POST | `/api/auth/reset-password` | `{token,password,confirmPassword}`; atomically changes password and revokes prior credentials |

All three endpoints require the existing session CSRF token and same-origin protections. Responses are no-store. No reset token appears in a normal API response. The password uses the existing 12–128 character policy and scrypt implementation.

## Security and persistence

Reset secrets use 32 cryptographically random bytes. Only SHA-256 hashes and absolute 30-minute expirations are stored in hidden-by-default `User.resetTokens`. A sparse multikey index supports lookup. The bounded array retains at most five outstanding requests. Expired entries are rejected by the query/check regardless of cleanup; they are removed on reset or displaced by later requests. There is no TTL index on users, which could delete accounts.

Known and unknown addresses generate/hash a secret and execute the same database operation. Responses have a common 300–400 ms minimum with jitter to mask ordinary read/write timing differences. SMTP runs after the response and is never awaited by the request path. Invalid configuration is reported identically for all addresses. SMTP failures log a fixed category only, never the provider exception, message, credentials, token, or password.

The final MongoDB update filters by the account, active status, token hash and unexpired timestamp, sets the new password hash, clears every reset token, and increments `sessionVersion` in one document write. Concurrent submissions, including different tokens for the same account, cannot both succeed. No replica-set transaction is required; standalone local MongoDB is supported.

Login captures `sessionVersion` in the regenerated session. Every protected authorization and session read compares it with the current account version. Increasing it immediately invalidates all earlier authenticated sessions, including an old-password login already in flight. Session documents may remain until their normal TTL expiry but cannot authorize access. Existing accounts/sessions without a stored version use zero, preserving current logins until a reset. No destructive migration is needed.

Limits per 15 minutes: reset requests 10 per IP and 5 per normalized email (hashed limiter key), token validation and reset combined 30 per IP. The existing global API limiter also applies. Like the existing login limiter, these counters are process-local; multiple workers/instances require a shared limiter store. SMTP delivery is asynchronous and best effort; there is no durable mail queue/retry worker. A process crash or SMTP failure after acceptance can require a new request. Account-token writes remain durable.

## Verification

`npm run check` runs domain/Supertest tests against isolated MongoDB plus the frontend build. New coverage exercises matching request responses, hash-only storage, trusted-origin links, policy/confirmation, invalid/expired tokens, concurrent consumption, sibling-token invalidation, revocation of multiple authenticated sessions, old/new password login, CSRF/origin rejection, both request limits, submission limits, missing SMTP configuration, sanitized delivery failures and Gmail transport configuration.

`npm run test:e2e` runs the full desktop/mobile suite. Recovery tests use real Express/MongoDB and an injected capture-mail adapter exclusively in `scripts/e2e-api.js`. The fixture writes synthetic reset emails to ignored `.local-data/e2e-reset-mailbox` files, which tests read and remove. No production mailbox/testing endpoint is added. Browser coverage follows email request through successful reset/login and rejects reuse; controlled responses exercise loading, expiration and unavailable-service feedback. Screenshots in ignored test results capture desktop/mobile recovery screens.

### Acceptance evidence (2026-10-24)

- Real Gmail SMTP connection/authentication: observed successful using the local server-only app-password configuration, without sending or printing credentials.
- Real password-recovery email arrival: confirmed by the owner in the publishing request ("SF-03 real email delivery now works"). This records owner confirmation; it is not inferred from the generic HTTP 202 response.
- Earlier delivery diagnostics found that the supplied recipient addresses had no matching active account in the configured local database at that time. Unknown-account requests deliberately did not send mail. Registration through the app is required before recovery can send a link.
- Manual reset completion, old-password rejection, new-password login, reset-link reuse rejection, and revocation of other real sessions: not independently verified or confirmed in this manual Gmail run. These behaviors have automated coverage against isolated MongoDB and the capture-mail adapter; Gmail OAuth2 authentication also remains untested live.
- Publication checks: `npm run check` (38 passing backend/domain tests and a successful production build); `npm run test:e2e` (16 passing desktop/mobile browser tests). Both commands were rerun successfully before publishing this branch.

No mailbox contents, recipient addresses, credentials, reset links, tokens, or local data are included as published evidence. This change does not claim deployment or a completed teammate acceptance review.

### Integration with the language-picker and toast UI

PR #5 was blocked by merge conflicts after main incorporated PR #4 (`1eb0b3d`). The conflicts were in `client/Auth.jsx` and `client/main.jsx`. Merging main into the existing SF-03 branch preserves the teammate's language pickers, toast provider and successful-login/registration notifications alongside recovery routing, shared account layout, login selection, password-reset confirmation and fragment scrubbing.

Recovery browser assertions now scope inline status messages to the account card, separately from the toast live region, and explicitly check registration and replacement-password login toasts. The integration was reviewed against current main to confirm that the teammate's other files remain intact and the PR still contains only SF-03 changes. The final staged diff passed whitespace and local-secret checks; ignored environment values and local data are excluded.

Integration validation passed: `npm run check` (44 backend/domain tests and the production build) and `npm run test:e2e` (20 desktop/mobile browser tests). The browser suite includes recovery, same-tab reset-link handling, language-picker persistence and validation, and success-toast behavior. Desktop recovery and mobile new-password screenshots were visually reviewed. Real Gmail manual acceptance remains limited to the owner confirmation above; this integration check used isolated test databases and captured test email.
