import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/db.js';
import { User } from '../server/modules/auth/model.js';
import { PlayerProfile, PlayerGame } from '../server/modules/profiles/model.js';
import { Game } from '../server/modules/games/model.js';
import { seedGames } from '../server/modules/games/catalog.js';
import { syncPandaScoreGames } from '../server/modules/games/pandascore.js';
import { createTournamentSearch } from '../server/modules/games/tournaments.js';
import { fixtureFetch } from './fixtures/competition-provider.js';
import { edgeDetails, legacyLanguage } from './fixtures/profile-edge-cases.js';
import { defaultPublicFields, publicFieldKeys, resolvePrivacy } from '../shared/profile-privacy.js';

const details = { platform: 'PC', rank: 'Champion II', server: 'Middle East', language: 'Arabic, English', availability: 'Sun–Thu 20:00–23:00 Asia/Riyadh; tryouts Fri' };
const profileValues = { displayName: 'PilotPlayer', bio: 'Ready to learn and compete.', region: 'Saudi Arabia', languages: ['Arabic', 'English'] };
const password = 'A long demo passphrase 2026!';
let mongo, app, directory, config, game, image;
let serial = 0;
const newEmail = () => `test-${++serial}@example.com`;

before(async () => {
  await mkdir('.local-data', { recursive: true });
  directory = await mkdtemp(resolve('.local-data/integration-'));
  await mkdir(join(directory, 'mongo'));
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: resolve('.local-data/mongodb-binaries') }, instance: { dbName: 'rosterlink_integration', dbPath: join(directory, 'mongo'), storageEngine: 'wiredTiger' } });
  config = { mongoUri: mongo.getUri('rosterlink_integration'), sessionSecret: 'integration-secret-only-'.repeat(3), uploadDir: join(directory, 'images'), origin: 'http://127.0.0.1:5173' };
  config.tournamentSearch = createTournamentSearch({ token: 'test-only', fetchImpl: fixtureFetch });
  await connectDatabase(config.mongoUri);
  await Promise.all([User.init(), PlayerProfile.init(), PlayerGame.init(), Game.init()]);
  await seedGames();
  game = await Game.findOne({ slug: 'rocket-league' });
  app = createApp(config);
  image = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#4b805a' } }).png().toBuffer();
}, { timeout: 180000 });

after(async () => {
  await app?.locals.sessionStore.close();
  await mongoose.disconnect();
  await mongo?.stop();
  // Only the uniquely generated test directory under this workspace is removed.
  if (directory) {
    assert.equal(dirname(directory), resolve('.local-data'), 'Cleanup must stay inside the workspace test-data root');
    await rm(directory, { recursive: true, force: true });
  }
});

async function visitor() {
  const agent = request.agent(app);
  const result = await agent.get('/api/auth/session').expect(200);
  return { agent, token: result.body.csrfToken };
}
async function register(email = newEmail()) {
  const user = await visitor();
  const result = await user.agent.post('/api/auth/register').set('X-CSRF-Token', user.token).send({ email, password }).expect(201);
  return { ...user, token: result.body.csrfToken, email, id: result.body.user.id };
}
async function createProfile(user) {
  const result = await user.agent.post('/api/profiles').set('X-CSRF-Token', user.token).send(profileValues).expect(201);
  return result.body.profile;
}

test('SF-06: unrelated edits preserve a valid legacy language string; unauthorized and oversized writes fail', async () => {
  // Separate limiter budgets keep this regression independent of the existing auth suite.
  const application = createApp(config);
  const signUp = async () => {
    const agent = request.agent(application);
    const session = await agent.get('/api/auth/session').expect(200);
    const result = await agent.post('/api/auth/register').set('X-CSRF-Token', session.body.csrfToken).send({ email: newEmail(), password }).expect(201);
    return { agent, token: result.body.csrfToken };
  };
  try {
    const user = await signUp(), profile = await createProfile(user);
    await PlayerGame.create({ profile: profile.id, game: game.id, schemaVersion: 2, details: edgeDetails });
    const path = `/api/profiles/${profile.id}/games/${game.id}`;
    const updated = await user.agent.put(path).set('X-CSRF-Token', user.token).send({ details: { ...edgeDetails, availability: 'Updated availability only' } }).expect(200);
    assert.equal(updated.body.section.details.language, legacyLanguage);
    assert.equal(updated.body.section.details.availability, 'Updated availability only');
    await user.agent.put(path).set('X-CSRF-Token', user.token).send({ details: { ...edgeDetails, language: 'X'.repeat(121) } }).expect(400);
    const other = await signUp();
    await other.agent.put(path).set('X-CSRF-Token', other.token).send({ details: edgeDetails }).expect(404);
    await request(application).put(path).send({ details: edgeDetails }).expect(403);
    const stored = await PlayerGame.findOne({ profile: profile.id, game: game.id });
    assert.equal(stored.details.get('language'), legacyLanguage);
    assert.equal(stored.details.get('availability'), 'Updated availability only');
  } finally { await application.locals.sessionStore.close(); }
});

test('provider catalog sync preserves Rocket League, updates icons and allows additional game profiles', async () => {
  let catalog = [{ id: 22, name: 'Rocket League', slug: 'rl' }, { id: 26, name: 'Valorant', slug: 'valorant', image_url: 'https://example.com/valorant.png' }];
  const options = { token: 'test-only-token', fetchImpl: async () => ({ ok: true, json: async () => catalog }) };
  assert.deepEqual(await syncPandaScoreGames(options), { count: 2, withImages: 1 });
  await syncPandaScoreGames(options);
  assert.equal(await Game.countDocuments({ providerId: 22 }), 1);
  const preserved = await Game.findById(game._id);
  assert.equal(preserved.fields[0].key, 'platform');
  const imported = await Game.findOne({ slug: 'valorant' });
  const response = await request(app).get('/api/games').expect(200);
  assert.equal(response.body.games.find(item => item.slug === 'valorant').imageUrl, 'https://example.com/valorant.png');
  const user = await register();
  const profile = await createProfile(user);
  await user.agent.post(`/api/profiles/${profile.id}/games`).set('X-CSRF-Token', user.token).send({ gameId: String(imported._id), details: { platform: 'PC', server: 'Middle East', language: 'English', availability: 'Fri 20:00 Asia/Riyadh' } }).expect(201);
  catalog = [{ id: 26, name: 'Valorant', slug: 'valorant' }];
  await syncPandaScoreGames(options);
  assert.equal((await Game.findById(imported._id)).imageUrl, null);
  await assert.rejects(syncPandaScoreGames({ ...options, fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  assert.ok(await Game.findById(imported._id));
  await PlayerGame.deleteMany({ game: imported._id });
  await Game.deleteOne({ _id: imported._id });
});

test('SF-01: registration persists a normalized unique email and a hash, without leaking credentials', async () => {
  const user = await register(' Registration@Example.com ');
  const stored = await User.findById(user.id).select('+passwordHash');
  assert.equal(stored.email, 'registration@example.com');
  assert.match(stored.passwordHash, /^scrypt\$/);
  assert.notEqual(stored.passwordHash, password);
  const session = await user.agent.get('/api/auth/session').expect(200);
  assert.equal(session.body.user.email, 'registration@example.com');
  assert.ok(!JSON.stringify(session.body).includes('password'));
  const duplicate = await visitor();
  await duplicate.agent.post('/api/auth/register').set('X-CSRF-Token', duplicate.token).send({ email: 'REGISTRATION@example.com', password }).expect(409);
});

test('SF-01 / TF-04: invalid registration, query injection and client-chosen roles are rejected', async () => {
  const user = await visitor();
  for (const body of [{}, { email: 'invalid', password }, { email: newEmail(), password: 'short' }, { email: { $ne: null }, password }, { email: newEmail(), password, role: 'admin' }]) {
    await user.agent.post('/api/auth/register').set('X-CSRF-Token', user.token).send(body).expect(400);
  }
});

test('SF-02 / TF-04: invalid login, valid login, cookie flags, session rotation, logout and replay rejection', async () => {
  const user = await register();
  const oldCookie = (await user.agent.get('/api/auth/session')).headers['set-cookie'];
  await user.agent.post('/api/auth/logout').set('X-CSRF-Token', user.token).expect(204);
  await user.agent.get('/api/profiles/me').expect(401);
  const session = await user.agent.get('/api/auth/session');
  user.token = session.body.csrfToken;
  for (const email of [user.email, 'missing@example.com']) {
    const result = await user.agent.post('/api/auth/login').set('X-CSRF-Token', user.token).send({ email, password: 'wrong' }).expect(401);
    assert.equal(result.body.message, 'Email or password is incorrect.');
  }
  const login = await user.agent.post('/api/auth/login').set('X-CSRF-Token', user.token).send({ email: user.email, password }).expect(200);
  const cookie = login.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
  if (oldCookie) assert.notEqual(cookie, oldCookie[0]);
  await user.agent.get('/api/profiles/me').expect(200);
  await user.agent.post('/api/auth/logout').set('X-CSRF-Token', login.body.csrfToken).expect(204);
  await request(app).get('/api/profiles/me').set('Cookie', cookie.split(';')[0]).expect(401);
});

test('TF-04: anonymous access, missing CSRF, stale tokens and foreign origins are rejected', async () => {
  await request(app).get('/api/profiles/me').expect(401);
  const user = await visitor();
  await user.agent.post('/api/auth/register').send({ email: newEmail(), password }).expect(403);
  await user.agent.post('/api/auth/register').set('X-CSRF-Token', user.token).set('Origin', 'https://untrusted.example').send({ email: newEmail(), password }).expect(403);
  const result = await user.agent.post('/api/auth/register').set('X-CSRF-Token', user.token).send({ email: newEmail(), password }).expect(201);
  assert.notEqual(result.body.csrfToken, user.token);
  await user.agent.post('/api/profiles').set('X-CSRF-Token', user.token).send(profileValues).expect(403);
});

test('SF-04 / TF-03: create/read/edit profile and restore it after a new login', async () => {
  const user = await register();
  assert.equal((await user.agent.get('/api/profiles/me')).body.profile, null);
  const profile = await createProfile(user);
  assert.equal(await PlayerProfile.countDocuments({ owner: user.id }), 1);
  await user.agent.post('/api/profiles').set('X-CSRF-Token', user.token).send(profileValues).expect(409);
  const updated = { ...profileValues, bio: 'Updated biography — لاعب تنافسي' };
  const result = await user.agent.put(`/api/profiles/${profile.id}`).set('X-CSRF-Token', user.token).send(updated).expect(200);
  assert.equal(result.body.profile.bio, updated.bio);
  assert.ok(!JSON.stringify(result.body).includes(user.email));
  await user.agent.post('/api/auth/logout').set('X-CSRF-Token', user.token).expect(204);
  const fresh = await visitor();
  await fresh.agent.post('/api/auth/login').set('X-CSRF-Token', fresh.token).send({ email: user.email, password }).expect(200);
  assert.equal((await fresh.agent.get('/api/profiles/me')).body.profile.bio, updated.bio);
});

test('SF-04: required/overlong data and ownership mass assignment are rejected', async () => {
  const user = await register();
  for (const body of [{ ...profileValues, displayName: '' }, { ...profileValues, bio: 'x'.repeat(1001) }, { ...profileValues, languages: [] }, { ...profileValues, owner: new mongoose.Types.ObjectId().toString() }]) {
    await user.agent.post('/api/profiles').set('X-CSRF-Token', user.token).send(body).expect(400);
  }
});

test('SF-04 / SF-06 / SF-13: profile and per-game languages are trimmed, de-duplicated, independent and public', async () => {
  const user = await register(); const profile = await createProfile(user);
  const path = `/api/profiles/${profile.id}`;
  const saved = await user.agent.put(path).set('X-CSRF-Token', user.token).send({ ...profileValues, languages: [' english ', 'Arabic', 'Urdu', 'urdu', ' French '] }).expect(200);
  assert.deepEqual(saved.body.profile.languages, ['English', 'Arabic', 'Urdu', 'French']);
  for (const languages of [[], ['  '], ['x'.repeat(41)], Array.from({ length: 9 }, (_, index) => `Language ${index}`), 'Arabic']) {
    await user.agent.put(path).set('X-CSRF-Token', user.token).send({ ...profileValues, languages }).expect(400);
  }
  const other = await Game.create({ slug: 'languages-second-game', providerId: 27, name: 'Second language game', enabled: true, schemaVersion: 2, fields: [] });
  await user.agent.post(`${path}/games`).set('X-CSRF-Token', user.token).send({ gameId: game.id, details: { ...details, language: 'Arabic / English' } }).expect(201);
  await user.agent.post(`${path}/games`).set('X-CSRF-Token', user.token).send({ gameId: other.id, details: { ...details, language: ' English, tagalog, Tagalog ' } }).expect(201);
  for (const language of ['', ' , ', 'x'.repeat(121)]) {
    const rejected = await user.agent.put(`${path}/games/${other.id}`).set('X-CSRF-Token', user.token).send({ details: { ...details, language } }).expect(400);
    assert.ok(rejected.body.fields['details.language']);
  }
  const me = (await user.agent.get('/api/profiles/me')).body;
  assert.deepEqual(me.profile.languages, ['English', 'Arabic', 'Urdu', 'French']);
  assert.equal(me.sections.find(item => item.gameId === game.id).details.language, 'Arabic, English');
  assert.equal(me.sections.find(item => item.gameId === other.id).details.language, 'English, tagalog');
  // Saving a game never changes the general profile languages, and vice versa.
  await user.agent.put(path).set('X-CSRF-Token', user.token).send({ ...profileValues, languages: ['Arabic'] }).expect(200);
  const shared = (await request(app).get(`/api/public/profiles/${profile.id}`).expect(200)).body;
  assert.deepEqual(shared.profile.languages, ['Arabic']);
  assert.equal(shared.sections.find(item => item.gameId === game.id).details.language, 'Arabic, English');
  assert.equal(shared.sections.find(item => item.gameId === other.id).details.language, 'English, tagalog');
  await PlayerGame.deleteMany({ game: other._id }); await Game.deleteOne({ _id: other._id });
});

test('SF-05 / SF-06: shared game create/edit/read/delete, duplicate prevention and required field validation', async () => {
  const user = await register(); const profile = await createProfile(user);
  const catalog = await user.agent.get('/api/games').expect(200);
  assert.equal(catalog.body.games.length, 1); assert.equal(catalog.body.games[0].name, 'Rocket League');
  const path = `/api/profiles/${profile.id}/games`;
  await user.agent.post(path).set('X-CSRF-Token', user.token).send({ gameId: game.id, details: { ...details, platform: 'Invalid' } }).expect(400);
  await user.agent.post(path).set('X-CSRF-Token', user.token).send({ gameId: new mongoose.Types.ObjectId().toString(), details }).expect(400);
  await user.agent.post(path).set('X-CSRF-Token', user.token).send({ gameId: game.id, details }).expect(201);
  await user.agent.post(path).set('X-CSRF-Token', user.token).send({ gameId: game.id, details }).expect(409);
  await user.agent.put(`${path}/${game.id}`).set('X-CSRF-Token', user.token).send({ details: { ...details, server: ' ' } }).expect(400);
  const changed = { ...details, rank: 'Diamond III' };
  await user.agent.put(`${path}/${game.id}`).set('X-CSRF-Token', user.token).send({ details: changed }).expect(200);
  const result = await user.agent.get('/api/profiles/me');
  assert.equal(result.body.sections[0].details.rank, 'Diamond III'); assert.equal(result.body.sections[0].gameId, game.id);
  assert.equal(result.body.sections[0].source, 'self_reported');
  await user.agent.delete(`${path}/${game.id}`).set('X-CSRF-Token', user.token).expect(204);
  assert.equal((await user.agent.get('/api/profiles/me')).body.sections.length, 0);
});

test('tournament search is authenticated and uses provider IDs; multiple self-reported entries persist and can be edited/deleted', async () => {
  await request(app).get(`/api/games/${game.id}/tournaments?q=ewc`).expect(401);
  const user = await register(); const profile = await createProfile(user);
  const other = await Game.create({ slug: 'local-name-different-from-provider', providerId: 34, name: 'Mobile Legends: Bang Bang', enabled: true, schemaVersion: 2, fields: [] });
  const catalogs = await user.agent.get('/api/games').expect(200);
  assert.deepEqual(catalogs.body.games.map(item => item.fields), Array(catalogs.body.games.length).fill(catalogs.body.games[0].fields));
  const search = await user.agent.get(`/api/games/${other.id}/tournaments?q=ewc&page=1`).expect(200);
  assert.equal(search.body.competitions[0].competition.gameId, 34);
  const selected = search.body.competitions.find(row => row.competition.seriesId === 10754);
  const detail = await user.agent.get(`/api/games/${other.id}/competitions/10754?leagueId=5264`).expect(200);
  assert.equal(detail.body.competition.stageIds.length, 7);
  await user.agent.get(`/api/games/${game.id}/competitions/10754?leagueId=5264`).expect(404);
  await user.agent.get(`/api/games/${other.id}/tournaments?q=a`).expect(400);
  await user.agent.get(`/api/games/${other.id}/tournaments?q=ewc&page=21`).expect(400);
  await user.agent.get('/api/games/not-an-id/tournaments?q=ewc').expect(404);
  const path = `/api/profiles/${profile.id}/games`;
  const experience = [{ name: selected.name, edition: selected.edition, competition: detail.body.competition, placement: '1st', result: { kind: 'exact', value: '1' } }, { name: 'Local LAN', edition: 'Summer 2025', placement: 'Runner-up' }];
  // No participation, identity, or result comparison is performed.
  await user.agent.post(path).set('X-CSRF-Token', user.token).send({ gameId: other.id, details: { ...details, server: 'Custom old server', rank: '' }, experience }).expect(201);
  await user.agent.post(path).set('X-CSRF-Token', user.token).send({ gameId: game.id, details, experience: [] }).expect(201);
  let restored = (await user.agent.get('/api/profiles/me')).body.sections;
  assert.equal(restored.length, 2);
  assert.equal(restored.find(item => item.gameId === other.id).experience[0].placement, '1st');
  assert.equal(restored.find(item => item.gameId === other.id).details.server, 'Custom old server');
  assert.deepEqual(restored.find(item => item.gameId === other.id).experience[0].competition.stageIds, detail.body.competition.stageIds);
  assert.equal(restored.find(item => item.gameId === other.id).experience[0].result.kind, 'exact');
  assert.equal(restored.find(item => item.gameId === other.id).source, 'self_reported');
  for (const field of ['name', 'edition', 'placement']) await user.agent.put(`${path}/${other.id}`).set('X-CSRF-Token', user.token).send({ details, experience: [{ ...experience[0], [field]: ' ' }] }).expect(400);
  await user.agent.put(`${path}/${game.id}`).set('X-CSRF-Token', user.token).send({ details, experience }).expect(400);
  const stranger = await register();
  await stranger.agent.put(`${path}/${other.id}`).set('X-CSRF-Token', stranger.token).send({ details, experience: [] }).expect(404);
  await stranger.agent.get(`/api/profiles/${profile.id}`).expect(404);
  await user.agent.put(`${path}/${other.id}`).set('X-CSRF-Token', user.token).send({ details, experience: [{ ...experience[0], placement: 'Top 8' }] }).expect(200);
  restored = (await user.agent.get('/api/profiles/me')).body.sections.find(item => item.gameId === other.id);
  assert.equal(restored.experience.length, 1); assert.equal(restored.experience[0].placement, 'Top 8');
  await user.agent.put(`${path}/${other.id}`).set('X-CSRF-Token', user.token).send({ details, experience: [] }).expect(200);
  assert.equal((await user.agent.get('/api/profiles/me')).body.sections.find(item => item.gameId === other.id).experience.length, 0);
  await PlayerGame.deleteMany({ game: other._id }); await Game.deleteOne({ _id: other._id });
});

test('legacy Rocket League and generic details remain readable and survive shared-form updates without guessing platform', async () => {
  const user = await register(); const profile = await createProfile(user);
  const original = { playlist: '2v2 Doubles', rank: 'Champion II', division: 'III', season: 'Season 20', preference: 'Flexible / rotation-based', server: 'Middle East', language: 'Arabic / English', availability: 'Sun–Thu 20:00–23:00 Asia/Riyadh' };
  await PlayerGame.create({ profile: profile.id, game: game.id, details: original, schemaVersion: 1 });
  let restored = (await user.agent.get('/api/profiles/me')).body.sections[0];
  assert.deepEqual(restored.details, original); assert.deepEqual(restored.legacyDetails, original);
  assert.equal(restored.sharedDetails.platform, undefined);
  assert.equal(restored.sharedDetails.rank, original.rank);
  const path = `/api/profiles/${profile.id}/games/${game.id}`;
  await user.agent.put(path).set('X-CSRF-Token', user.token).send({ details: restored.sharedDetails }).expect(400);
  await user.agent.put(path).set('X-CSRF-Token', user.token).send({ details }).expect(200);
  await user.agent.put(path).set('X-CSRF-Token', user.token).send({ details: { ...details, rank: 'Anything' } }).expect(200);
  restored = (await user.agent.get('/api/profiles/me')).body.sections[0];
  assert.deepEqual(restored.legacyDetails, original); assert.equal(restored.schemaVersion, 2);
  const other = await Game.create({ slug: 'legacy-generic', providerId: 26, name: 'Legacy generic', schemaVersion: 1, fields: [] });
  const generic = { playerName: 'OldPlayer', preference: 'Support', server: 'Europe', language: 'English', availability: 'Fridays' };
  await PlayerGame.create({ profile: profile.id, game: other.id, details: generic, schemaVersion: 1 });
  await user.agent.put(`/api/profiles/${profile.id}/games/${other.id}`).set('X-CSRF-Token', user.token).send({ details }).expect(200);
  restored = (await user.agent.get('/api/profiles/me')).body.sections.find(item => item.gameId === other.id);
  assert.deepEqual(restored.legacyDetails, generic);
  await PlayerGame.deleteMany({ game: other.id }); await Game.deleteOne({ _id: other.id });
});

test('TF-03: unique indexes protect email, player ownership and game sections at database level', async () => {
  const user = await register(); const profile = await createProfile(user);
  await assert.rejects(User.create({ email: user.email, passwordHash: 'not-a-real-password' }), error => error.code === 11000);
  await assert.rejects(PlayerProfile.create({ ...profileValues, owner: user.id }), error => error.code === 11000);
  const section = { profile: profile.id, game: game.id, schemaVersion: 1, details };
  await PlayerGame.create(section);
  await assert.rejects(PlayerGame.create(section), error => error.code === 11000);
});

test('SF-07: profile and header persist, can be read/replaced/removed, and originals are cleaned up', async () => {
  const user = await register(); const profile = await createProfile(user);
  for (const kind of ['profile', 'header']) {
    const path = `/api/profiles/${profile.id}/images/${kind}`;
    const uploaded = await user.agent.post(path).set('X-CSRF-Token', user.token).attach('image', image, { filename: 'player.png', contentType: 'image/png' }).expect(200);
    assert.ok(uploaded.body.profile[`${kind}ImageUrl`]);
    const fetched = await user.agent.get(path).expect(200);
    assert.match(fetched.headers['content-type'], /image\/webp/);
    const decoded = await sharp(fetched.body).metadata(); assert.equal(decoded.format, 'webp');
    const count = (await readdir(config.uploadDir)).length;
    await user.agent.post(path).set('X-CSRF-Token', user.token).attach('image', image, { filename: 'replacement.png', contentType: 'image/png' }).expect(200);
    assert.equal((await readdir(config.uploadDir)).length, count);
    await user.agent.delete(path).set('X-CSRF-Token', user.token).expect(200);
    await user.agent.get(path).expect(404);
  }
});

test('SF-07: malformed, disguised, unsupported, missing, oversized and excessive-pixel files are rejected', async () => {
  const user = await register(); const profile = await createProfile(user);
  const path = `/api/profiles/${profile.id}/images/profile`;
  await user.agent.post(path).set('X-CSRF-Token', user.token).attach('image', Buffer.from('<svg><script>alert(1)</script></svg>'), { filename: 'fake.png', contentType: 'image/png' }).expect(400);
  await user.agent.post(path).set('X-CSRF-Token', user.token).attach('image', image, { filename: 'mismatch.jpg', contentType: 'image/jpeg' }).expect(400);
  await user.agent.post(path).set('X-CSRF-Token', user.token).attach('image', image, { filename: 'image.svg', contentType: 'image/svg+xml' }).expect(400);
  await user.agent.post(path).set('X-CSRF-Token', user.token).expect(400);
  await user.agent.post(path).set('X-CSRF-Token', user.token).attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(413);
  const huge = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'black' } }).png().toBuffer();
  await user.agent.post(path).set('X-CSRF-Token', user.token).attach('image', huge, { filename: 'pixels.png', contentType: 'image/png' }).expect(400);
});

test('TF-04 / SF-04–07: User B cannot read or change User A profile, games, or images by changing IDs', async () => {
  const a = await register(); const profile = await createProfile(a); const b = await register();
  const path = `/api/profiles/${profile.id}`;
  await a.agent.post(`${path}/games`).set('X-CSRF-Token', a.token).send({ gameId: game.id, details }).expect(201);
  await a.agent.post(`${path}/images/profile`).set('X-CSRF-Token', a.token).attach('image', image, { filename: 'a.png', contentType: 'image/png' }).expect(200);
  await b.agent.get(path).expect(404);
  await b.agent.put(path).set('X-CSRF-Token', b.token).send({ ...profileValues, displayName: 'Hijacked' }).expect(404);
  await b.agent.post(`${path}/games`).set('X-CSRF-Token', b.token).send({ gameId: game.id, details }).expect(404);
  await b.agent.put(`${path}/games/${game.id}`).set('X-CSRF-Token', b.token).send({ details }).expect(404);
  await b.agent.delete(`${path}/games/${game.id}`).set('X-CSRF-Token', b.token).expect(404);
  for (const kind of ['profile', 'header']) {
    await b.agent.get(`${path}/images/${kind}`).expect(404);
    await b.agent.post(`${path}/images/${kind}`).set('X-CSRF-Token', b.token).attach('image', image, { filename: 'b.png', contentType: 'image/png' }).expect(404);
    await b.agent.delete(`${path}/images/${kind}`).set('X-CSRF-Token', b.token).expect(404);
  }
  assert.equal((await a.agent.get(path)).body.profile.displayName, profileValues.displayName);
  await b.agent.get('/api/profiles/not-an-id').expect(404);
});

test('SF-13: a shared profile link is readable without login, exposes only public fields, and writes stay private', async () => {
  const owner = await register(); const profile = await createProfile(owner);
  const path = `/api/profiles/${profile.id}`;
  await owner.agent.post(`${path}/games`).set('X-CSRF-Token', owner.token).send({ gameId: game.id, details }).expect(201);
  await owner.agent.post(`${path}/images/profile`).set('X-CSRF-Token', owner.token).attach('image', image, { filename: 'a.png', contentType: 'image/png' }).expect(200);
  const publicPath = `/api/public/profiles/${profile.id}`;
  const shared = await request(app).get(publicPath).expect(200);
  assert.equal(shared.body.profile.displayName, profileValues.displayName);
  assert.equal(shared.body.sections[0].details.platform, 'PC');
  assert.deepEqual(Object.keys(shared.body.profile).sort(), ['bio', 'displayName', 'headerImageUrl', 'id', 'languages', 'openToOffers', 'profileImageUrl', 'region']);
  const serialized = JSON.stringify(shared.body);
  for (const secret of [owner.email, owner.id, 'owner', 'legacyDetails', 'passwordHash']) assert.ok(!serialized.includes(secret), `${secret} must not be public`);
  assert.match((await request(app).get(shared.body.profile.profileImageUrl).expect(200)).headers['content-type'], /image\/webp/);
  await request(app).get(`${publicPath}/images/header`).expect(404);
  await request(app).get(`${publicPath}/images/other`).expect(404);
  await request(app).get('/api/public/profiles/not-an-id').expect(404);
  await request(app).get(`/api/public/profiles/${new mongoose.Types.ObjectId()}`).expect(404);
  await request(app).get(path).expect(401);
  await request(app).put(publicPath).send(profileValues).expect(403);
});

const settingsPath = profile => `/api/profiles/${profile.id}/settings`;
const allHidden = Object.fromEntries(publicFieldKeys.map(key => [key, false]));
const tournament = { name: 'Regional Cup', edition: '2026', placement: 'Top 8' };
// Each SF-08 test gets its own app, so its sign-ups have their own auth rate-limit budget (as in the SF-06 test).
async function sf08Test(run) {
  const application = createApp(config);
  const visit = async () => {
    const agent = request.agent(application);
    const result = await agent.get('/api/auth/session').expect(200);
    return { agent, token: result.body.csrfToken };
  };
  const signUp = async () => {
    const user = await visit(), email = newEmail();
    const result = await user.agent.post('/api/auth/register').set('X-CSRF-Token', user.token).send({ email, password }).expect(201);
    return { ...user, token: result.body.csrfToken, email, id: result.body.user.id };
  };
  try { await run({ application, visit, signUp }); } finally { await application.locals.sessionStore.close(); }
}

test('SF-08: a profile saved before SF-08 resolves to defaults everywhere, including lean queries', () => sf08Test(async ({ application, signUp }) => {
  const user = await signUp(); const profile = await createProfile(user);
  // Simulate a document written before the feature existed.
  await PlayerProfile.collection.updateOne({ _id: new mongoose.Types.ObjectId(profile.id) }, { $unset: { openToOffers: '', publicFields: '' } });
  const raw = await PlayerProfile.collection.findOne({ _id: new mongoose.Types.ObjectId(profile.id) });
  assert.equal(raw.openToOffers, undefined); assert.equal(raw.publicFields, undefined);
  assert.deepEqual(resolvePrivacy(await PlayerProfile.findById(profile.id).lean()), { openToOffers: false, publicFields: defaultPublicFields });
  const me = (await user.agent.get('/api/profiles/me').expect(200)).body.profile;
  assert.equal(me.openToOffers, false);
  assert.deepEqual(me.publicFields, defaultPublicFields);
  const shared = (await request(application).get(`/api/public/profiles/${profile.id}`).expect(200)).body.profile;
  assert.deepEqual(Object.keys(shared).sort(), ['bio', 'displayName', 'headerImageUrl', 'id', 'languages', 'openToOffers', 'profileImageUrl', 'region']);
  assert.equal(shared.openToOffers, false);
  assert.equal(await PlayerProfile.countDocuments({ _id: profile.id, openToOffers: true }), 0);
  // A new profile stores the defaults explicitly.
  const fresh = await createProfile(await signUp());
  assert.deepEqual(resolvePrivacy(await PlayerProfile.findById(fresh.id).lean()), { openToOffers: false, publicFields: defaultPublicFields });
}));

test('SF-08: the owner updates settings partially, sees every field, and settings persist after a new login', () => sf08Test(async ({ visit, signUp }) => {
  const user = await signUp(); const profile = await createProfile(user);
  await PlayerProfile.collection.updateOne({ _id: new mongoose.Types.ObjectId(profile.id) }, { $unset: { publicFields: '' } });
  const first = await user.agent.patch(settingsPath(profile)).set('X-CSRF-Token', user.token).send({ openToOffers: true, publicFields: { bio: false } }).expect(200);
  assert.equal(first.body.profile.openToOffers, true);
  assert.deepEqual(first.body.profile.publicFields, { ...defaultPublicFields, bio: false });
  const second = await user.agent.patch(settingsPath(profile)).set('X-CSRF-Token', user.token).send({ publicFields: { rank: false } }).expect(200);
  assert.deepEqual(second.body.profile.publicFields, { ...defaultPublicFields, bio: false, rank: false }, 'omitted keys keep their saved value');
  assert.equal(second.body.profile.openToOffers, true);
  assert.equal(second.body.profile.bio, profileValues.bio, 'the owner still receives hidden fields');
  assert.equal(await PlayerProfile.countDocuments({ _id: profile.id, openToOffers: true }), 1);
  await user.agent.post('/api/auth/logout').set('X-CSRF-Token', user.token).expect(204);
  const fresh = await visit();
  await fresh.agent.post('/api/auth/login').set('X-CSRF-Token', fresh.token).send({ email: user.email, password }).expect(200);
  const me = (await fresh.agent.get('/api/profiles/me').expect(200)).body.profile;
  assert.equal(me.openToOffers, true);
  assert.deepEqual(me.publicFields, { ...defaultPublicFields, bio: false, rank: false });
}));

test('SF-08: settings reject anonymous users, other players, unknown keys and non-Boolean values', () => sf08Test(async ({ application, visit, signUp }) => {
  const owner = await signUp(); const profile = await createProfile(owner); const other = await signUp();
  const path = settingsPath(profile);
  const anonymous = await visit();
  await anonymous.agent.patch(path).set('X-CSRF-Token', anonymous.token).send({ openToOffers: true }).expect(401);
  await request(application).patch(path).send({ openToOffers: true }).expect(403);
  await other.agent.patch(path).set('X-CSRF-Token', other.token).send({ openToOffers: true }).expect(404);
  const cases = [
    [{ openToOffers: true, owner: other.id }, /Unknown setting: owner/],
    [{ publicFields: { email: true } }, /Unknown setting: email/],
    [{ publicFields: { passwordHash: true } }, /Unknown setting: passwordHash/],
    [{ openToOffers: 'yes' }, /openToOffers must be true or false/],
    [{ publicFields: { bio: 0 } }, /publicFields\.bio must be true or false/],
    [{ publicFields: { rank: null } }, /publicFields\.rank must be true or false/],
    [{}, /at least one setting/],
    [[true], /JSON object/],
  ];
  for (const [body, message] of cases) {
    const rejected = await owner.agent.patch(path).set('X-CSRF-Token', owner.token).send(body).expect(400);
    assert.match(rejected.body.message, message, JSON.stringify(body));
  }
  const stored = resolvePrivacy(await PlayerProfile.findById(profile.id).lean());
  assert.deepEqual(stored, { openToOffers: false, publicFields: defaultPublicFields }, 'rejected requests change nothing');
}));

test('SF-08: the public endpoint omits hidden fields, hidden images and tournament experience', () => sf08Test(async ({ application, signUp }) => {
  const owner = await signUp(); const profile = await createProfile(owner);
  const path = `/api/profiles/${profile.id}`, publicPath = `/api/public/profiles/${profile.id}`;
  await owner.agent.post(`${path}/games`).set('X-CSRF-Token', owner.token).send({ gameId: game.id, details, experience: [tournament] }).expect(201);
  for (const kind of ['profile', 'header']) await owner.agent.post(`${path}/images/${kind}`).set('X-CSRF-Token', owner.token).attach('image', image, { filename: 'a.png', contentType: 'image/png' }).expect(200);
  const visible = (await request(application).get(publicPath).expect(200)).body;
  const imageUrl = visible.profile.profileImageUrl;
  await request(application).get(imageUrl).expect(200);
  assert.equal(visible.sections[0].experience[0].name, tournament.name);

  await owner.agent.patch(settingsPath(profile)).set('X-CSRF-Token', owner.token).send({ openToOffers: true, publicFields: allHidden }).expect(200);
  const hidden = (await request(application).get(publicPath).expect(200)).body;
  assert.deepEqual(hidden.profile, { id: profile.id, displayName: profileValues.displayName, openToOffers: true });
  assert.deepEqual(hidden.sections, [{ gameId: game.id, details: {} }]);
  const serialized = JSON.stringify(hidden);
  for (const value of [profileValues.bio, profileValues.region, 'Arabic', 'Champion II', 'Sun–Thu', tournament.name, 'publicFields']) assert.ok(!serialized.includes(value), `${value} must be hidden`);
  for (const kind of ['profile', 'header']) await request(application).get(`${publicPath}/images/${kind}`).expect(404);

  // Each toggle works on its own: hiding only rank removes only rank.
  await owner.agent.patch(settingsPath(profile)).set('X-CSRF-Token', owner.token).send({ openToOffers: false, publicFields: { ...defaultPublicFields, rank: false } }).expect(200);
  const partial = (await request(application).get(publicPath).expect(200)).body;
  assert.equal(partial.profile.openToOffers, false);
  assert.equal(partial.profile.bio, profileValues.bio);
  assert.deepEqual(Object.keys(partial.sections[0].details).sort(), ['availability', 'language', 'platform', 'server']);
  assert.equal(partial.sections[0].experience.length, 1);
  const me = (await owner.agent.get(path).expect(200)).body;
  assert.equal(me.sections[0].details.rank, 'Champion II', 'the owner still sees hidden game fields');
}));

test('TF-03 / SF-02 / SF-04–07: account, session, profile, game and both images survive MongoDB and app restart', { timeout: 60000 }, async () => {
  const user = await register(); const profile = await createProfile(user);
  const path = `/api/profiles/${profile.id}`;
  await user.agent.post(`${path}/games`).set('X-CSRF-Token', user.token).send({ gameId: game.id, details }).expect(201);
  for (const kind of ['profile', 'header']) await user.agent.post(`${path}/images/${kind}`).set('X-CSRF-Token', user.token).attach('image', image, { filename: 'persist.png', contentType: 'image/png' }).expect(200);
  // Capture an actual authenticated cookie from a login, then rebuild the app and restart mongod.
  const fresh = await visitor();
  const login = await fresh.agent.post('/api/auth/login').set('X-CSRF-Token', fresh.token).send({ email: user.email, password }).expect(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await request(app).get('/api/profiles/me').set('Cookie', cookie).expect(200);
  const signedValue = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  const sessionId = signedValue.slice(2, signedValue.lastIndexOf('.'));
  const savedSession = await mongoose.connection.db.collection('sessions').findOne({ _id: sessionId });
  assert.ok(savedSession, 'The authenticated session must exist before restart');
  assert.equal(JSON.parse(savedSession.session).userId, user.id);
  assert.ok(savedSession.expires > new Date(), 'The session must not already be expired');
  await app.locals.sessionStore.close(); await mongoose.disconnect();
  await mongo.stop({ doCleanup: false, force: false });
  await mongo.start(true);
  config.mongoUri = mongo.getUri('rosterlink_integration');
  await connectDatabase(config.mongoUri);
  assert.ok(await User.exists({ _id: user.id }), 'User must remain on disk after restart');
  assert.ok(await PlayerProfile.exists({ _id: profile.id }), 'Profile must remain on disk after restart');
  assert.ok(await mongoose.connection.db.collection('sessions').countDocuments(), 'Sessions must remain on disk after restart');
  const persistedSession = await mongoose.connection.db.collection('sessions').findOne({ _id: sessionId });
  assert.ok(persistedSession, 'The specific login session must survive restart');
  assert.ok(persistedSession.expires > new Date(), 'The specific login session must remain unexpired');
  app = createApp(config);
  const restoredSession = await new Promise((resolve, reject) => app.locals.sessionStore.get(sessionId, (error, value) => error ? reject(error) : resolve(value)));
  assert.ok(restoredSession, 'The authenticated session must be readable after restart');
  assert.equal(restoredSession.userId, user.id);
  const result = await request(app).get('/api/profiles/me').set('Cookie', cookie).expect(200);
  assert.equal(result.body.profile.displayName, profileValues.displayName);
  assert.deepEqual(result.body.sections[0].details, details);
  assert.ok(result.body.profile.profileImageUrl); assert.ok(result.body.profile.headerImageUrl);
  for (const kind of ['profile', 'header']) await request(app).get(`${path}/images/${kind}`).set('Cookie', cookie).expect(200);
});
