# MongoDB guide and schema history — TF-03 / KF-04

## Sprint 2 additive collections

| Model | Relationships and persistence rules | Indexes |
| --- | --- | --- |
| Organization | Name, description, region, optional HTTP(S) website; nonempty User manager references. Creator added automatically. | `managers` |
| Team | Immutable Organization and Game references; name/description; team-scoped User manager references. | `organization`, `managers` |
| Opening | Immutable Team and server-derived Game; role, platform, game-specific requirements, optional rank, region, language, schedule/timezone, UTC deadline, active/closed status, creator/updater/closure actors and timestamps. | `(status,deadline,game)`, `team` |

Managers are membership references scoped to their Organization or Team document, not separate accounts or global User flags. One user can have a player profile and roles in multiple organizations/teams. `$addToSet` makes grants idempotent; `$pull` revokes. Organization manager removal includes an atomic size guard so simultaneous requests cannot remove the last manager. Role lists require organization-wide permission; public DTOs omit membership and actor identities.

All API writes validate with strict Zod schemas before Mongoose persistence. Parent references are resolved by backend permission checks. Teams must select an enabled game when created; team organization/game cannot later change through the API. Openings copy the selected team's game only on creation. UTC deadline comparison excludes expired openings immediately from active lists. Closed records are retained, never deleted; active expired records may receive a future deadline by authorized edit.

These collections are additive: no rewrite of Sprint 1 users, profiles, games, images, sessions, reset tokens, or shared links. Startup initializes their indexes before accepting traffic. Tests use independent disposable WiredTiger databases and verify acknowledged data across an actual MongoDB stop/start.

## Schema version 1

Initial Sprint 1 schema; no existing application-data migration. Mongoose initializes indexes before the API starts. Review production index changes explicitly in future migrations. `npm run seed` is an idempotent catalog update; it never rewrites player sections or creates fake users.

| Model / collection | Purpose and relationships | Constraints/indexes |
| --- | --- | --- |
| User / `users` | Single authentication identity; no exclusive account type | Unique normalized email, required hidden-by-default hash, status, timestamps |
| PlayerProfile / `playerprofiles` | Optional profile with immutable User owner | Unique owner; name/bio/region/language limits; private media keys; timestamps |
| Game / `games` | Supported game/form configuration | Unique slug, enabled flag, schemaVersion, field types/options/sources |
| PlayerGame / `playergames` | References PlayerProfile and Game | Unique compound `{profile:1,game:1}`; immutable refs/self_reported source; string Map details; schemaVersion; timestamps |
| Session / `sessions` | Private Express session data | Session key and expiry TTL index via connect-mongo |

Profile DTOs omit account email, hash, owner ID, and storage keys. No public profile route is implemented yet; later public DTOs should expose selected profile data without private account/contact fields.

## Validation

SF-03 adds hidden `User.resetTokens` (at most five SHA-256 hashes with expiration), a sparse `resetTokens.hash` index, and `User.sessionVersion` (default zero). Reset atomically changes the password, clears tokens and increments the version. Existing accounts and sessions need no destructive migration. Details: [password recovery](password-recovery.md).

Zod checks types, required values, lengths, and unknown keys. Mongoose adds persistence constraints. Unique database indexes prevent races; checking for an existing email alone is insufficient. Duplicate-key errors map to safe 409 responses.

The browser and backend consume field definitions from MongoDB. Backend game validation rejects unknown fields/options, checks required values/lengths, and omits division for Unranked/Supersonic Legend. Cross-document catalog validation is in the backend validator; a Mongoose Map alone cannot enforce these options. Direct administrative writes must use equivalent validation or a reviewed migration. Catalog schema changes must consider saved section schemaVersion values.

## Ownership-aware query

The user comes from the server session, never submitted owner/userId fields. General updates explicitly filter ownership:

```javascript
await PlayerProfile.findOneAndUpdate(
  { _id: req.profile._id, owner: req.user._id },
  { $set: values },
  { returnDocument: 'after', runValidators: true },
);
```

The router first resolves the parent with `findOne({_id:id, owner:req.user._id})`. Game writes filter that authorized profile and game. Image routes check ownership before parsing files and repeat the owner filter when changing references. A unique index does not replace authorization.

Profiles and game sections grow independently. Future organizations, teams, applications, and history receive their own collections when implemented.

## Rocket League pilot coverage

One primary competitive Soccar playlist per section: 1v1 Duel, 2v2 Doubles, or 3v3 Standard. Ranks: Unranked; Bronze through Grand Champion I–III; Supersonic Legend. Division I–IV applies below Supersonic Legend. Season is self-entered rather than assuming a current live season. Preferences are our descriptive choices, not official fixed positions. All ranks are self-reported; no live-rank provider exists.

Sources: [Epic ranks](https://www.epicgames.com/help/c-37599050/a20928700?lang=en-US), [Epic server regions](https://www.epicgames.com/help/c-37599050/c-32343914/a15871185?lang=en-US), [Epic matchmaking/playlists](https://www.epicgames.com/help/c-37599050/c-32343914/how-does-the-matchmaking-and-rank-system-work-in-rocket-league-a12805879).

## KF-04 team exercise, pending

After sharing is authorized, have a teammate follow the README from a fresh checkout. Register, save/edit a profile/game and both images, reload and sign in again. Explain User → PlayerProfile → PlayerGame → Game, inspect indexes with an approved database client, run `npm test`, and explain why a hard-to-guess ID does not replace an owner filter. Never paste hashes/session contents into a report. Record the real participant, commands/results, and corrections only after this occurs. Automated verification does not prove a teammate completed the exercise.
