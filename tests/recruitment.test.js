import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { z } from 'zod';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/db.js';
import { User } from '../server/modules/auth/model.js';
import { Game } from '../server/modules/games/model.js';
import { seedGames } from '../server/modules/games/catalog.js';
import { Organization, Team, Opening, recruitmentModels } from '../server/modules/recruitment/models.js';

const password = 'Sprint Two test passphrase!';
const orgValues = { name: 'Falcons', description: 'Competitive esports organization — فريق', region: 'Saudi Arabia', website: 'https://example.com' };
const teamValues = { name: 'Falcons Rocket League', description: 'Our first game team.' };
const openingValues = { role: 'Rotation player', requirements: 'Rocket League: competitive 3v3 rotation and replay review.', platform: 'PC', rank: 'Champion or equivalent', region: 'Middle East', language: 'Arabic / English', schedule: 'Sun–Thu 20:00–23:00', timezone: 'Asia/Riyadh', deadline: '2099-11-04T23:59:00+03:00' };
const identifier = z.string().regex(/^[a-f\d]{24}$/);
const openingDTO = z.object({ id: identifier, team: identifier, game: identifier, role: z.string(), requirements: z.string(), platform: z.string(), rank: z.string(), region: z.string(), language: z.string(), schedule: z.string(), timezone: z.string(), deadline: z.iso.datetime(), status: z.enum(['active', 'closed']), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), closedAt: z.iso.datetime().optional() }).strict();
let mongo, directory, app, config, owner, outsider, scoped, secondManager, visitor, game, otherGame, orgA, orgB, teamA, sibling, teamB;
const write = (actor, method, path, values) => actor.agent[method](`/api${path}`).set('X-CSRF-Token', actor.token).send(values);
const get = path => request(app).get(`/api${path}`);
async function newVisitor() { const agent = request.agent(app); const response = await agent.get('/api/auth/session').expect(200); return { agent, token: response.body.csrfToken }; }
async function register(email) { const actor = await newVisitor(); const response = await write(actor, 'post', '/auth/register', { email, password }).expect(201); return { ...actor, token: response.body.csrfToken, id: response.body.user.id, email }; }
const createOpening = async (actor = owner, team = teamA, values = openingValues) => (await write(actor, 'post', `/teams/${team.id}/openings`, values).expect(201)).body.opening;

before(async () => {
  await mkdir('.local-data', { recursive: true }); directory = await mkdtemp(resolve('.local-data/recruitment-')); await mkdir(join(directory, 'mongo'));
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: resolve('.local-data/mongodb-binaries') }, instance: { dbName: 'recruitment', dbPath: join(directory, 'mongo'), storageEngine: 'wiredTiger' } });
  config = { mongoUri: mongo.getUri('recruitment'), sessionSecret: 'sprint-two-tests-only-secret-'.repeat(3), uploadDir: join(directory, 'images'), origin: 'http://127.0.0.1:5173' };
  await connectDatabase(config.mongoUri); await Promise.all([User, Game, ...recruitmentModels].map(model => model.init())); await seedGames();
  game = await Game.findOne({ slug: 'rocket-league' }); otherGame = await Game.create({ slug: 'test-valorant', name: 'Valorant', schemaVersion: 2 });
  app = createApp(config); owner = await register('owner@example.com'); outsider = await register('other-org@example.com'); scoped = await register('team-manager@example.com'); secondManager = await register('org-manager@example.com'); visitor = await newVisitor();
  orgA = (await write(owner, 'post', '/organizations', orgValues).expect(201)).body.organization;
  orgB = (await write(outsider, 'post', '/organizations', { ...orgValues, name: 'Wolves' }).expect(201)).body.organization;
  teamA = (await write(owner, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, gameId: game.id }).expect(201)).body.team;
  sibling = (await write(owner, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, name: 'Falcons Valorant', gameId: otherGame.id }).expect(201)).body.team;
  teamB = (await write(outsider, 'post', `/organizations/${orgB.id}/teams`, { ...teamValues, name: 'Wolves RL', gameId: game.id }).expect(201)).body.team;
}, { timeout: 240000 });
after(async () => { await app?.locals.sessionStore.close(); await mongoose.disconnect(); await mongo?.stop(); if (directory) { assert.equal(dirname(directory), resolve('.local-data')); await rm(directory, { recursive: true, force: true }); } });

test('SF-14 public DTO privacy, creator management, validated organization edits', async () => {
  const response = await get(`/organizations/${orgA.id}`).expect(200);
  assert.match(response.headers['content-type'], /json/); assert.equal(response.headers['cache-control'], 'no-store'); assert.ok(response.headers.ratelimit);
  assert.equal(response.body.organization.name, 'Falcons'); assert.equal(response.body.teams.length, 2);
  assert.equal(response.body.organization.managers, undefined); assert.equal(response.body.organization.createdBy, undefined);
  const workspace = (await owner.agent.get('/api/management').expect(200)).body;
  assert.equal(workspace.organizations[0].canManage, true);
  await write(owner, 'put', `/organizations/${orgA.id}`, { ...orgValues, description: 'Edited and persistent.' }).expect(200);
  assert.equal((await get(`/organizations/${orgA.id}`)).body.organization.description, 'Edited and persistent.');
  for (const values of [{ ...orgValues, name: ' ' }, { ...orgValues, website: 'javascript:alert(1)' }, { ...orgValues, managers: [outsider.id] }]) await write(owner, 'post', '/organizations', values).expect(400);
  await write(outsider, 'put', `/organizations/${orgA.id}`, orgValues).expect(403);
  await get('/organizations/not-an-id').expect(404); await get(`/organizations/${new mongoose.Types.ObjectId()}`).expect(404);
});

test('SF-14–20 unauthenticated and missing/foreign CSRF requests fail without writes', async () => {
  await get('/unknown-route').expect(404);
  for (const [method, path, body] of [['post', '/organizations', orgValues], ['put', `/organizations/${orgA.id}`, orgValues], ['post', `/organizations/${orgA.id}/teams`, { ...teamValues, gameId: game.id }], ['put', `/teams/${teamA.id}`, teamValues], ['post', `/organizations/${orgA.id}/roles`, { email: scoped.email }], ['delete', `/organizations/${orgA.id}/roles`, { userId: owner.id }], ['post', `/teams/${teamA.id}/openings`, openingValues]]) await write(visitor, method, path, body).expect(401);
  await visitor.agent.get('/api/management').expect(401); await visitor.agent.get(`/api/organizations/${orgA.id}/roles`).expect(401);
  await owner.agent.post('/api/organizations').send(orgValues).expect(403);
  await write(owner, 'post', '/organizations', orgValues).set('Origin', 'https://evil.example').expect(403);
});

test('SF-15 teams reference immutable organization/game; validate edits and public pages', async () => {
  assert.equal(teamA.organization, orgA.id); assert.equal(teamA.game, game.id);
  const page = (await get(`/teams/${teamA.id}`).expect(200)).body;
  assert.equal(page.team.organizationName, 'Falcons'); assert.equal(page.team.gameName, 'Rocket League'); assert.equal(page.team.managers, undefined);
  await write(owner, 'put', `/teams/${teamA.id}`, { ...teamValues, name: 'Falcons RL updated' }).expect(200);
  await write(owner, 'put', `/teams/${teamA.id}`, { ...teamValues, gameId: otherGame.id }).expect(400);
  await write(owner, 'put', `/teams/${teamA.id}`, { ...teamValues, organization: orgB.id }).expect(400);
  await write(owner, 'put', `/teams/${teamA.id}`, { ...teamValues, description: '' }).expect(400);
  await write(outsider, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, gameId: game.id }).expect(403);
  await write(owner, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, gameId: String(new mongoose.Types.ObjectId()) }).expect(400);
  await write(owner, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, gameId: 'bad' }).expect(400);
  await Game.updateOne({ _id: otherGame._id }, { $set: { enabled: false } });
  await write(owner, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, gameId: otherGame.id }).expect(400);
  await Game.updateOne({ _id: otherGame._id }, { $set: { enabled: true } });
  await get('/teams/bad').expect(404);
});

test('SF-18 assign existing users idempotently; reject nonexistent and cross-organization scopes', async () => {
  await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: 'missing@example.com' }).expect(400);
  await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: 'bad' }).expect(400);
  await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: scoped.email, teamId: teamB.id }).expect(403);
  await write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: scoped.id, teamId: teamB.id }).expect(403);
  for (let i = 0; i < 2; i++) await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: scoped.email, teamId: teamA.id }).expect(204);
  const roles = (await owner.agent.get(`/api/organizations/${orgA.id}/roles`).expect(200)).body.roles;
  assert.equal(roles.filter(role => role.userId === scoped.id).length, 1);
  const workspace = (await scoped.agent.get('/api/management').expect(200)).body;
  assert.equal(workspace.organizations.length, 1); assert.equal(workspace.organizations[0].canManage, false); assert.deepEqual(workspace.teams.map(team => team.id), [teamA.id]);
});

test('SF-18–19 team scope cannot escalate, edit sibling teams, or cross organizations', async () => {
  await write(scoped, 'put', `/teams/${teamA.id}`, teamValues).expect(200);
  for (const team of [sibling, teamB]) {
    await write(scoped, 'put', `/teams/${team.id}`, teamValues).expect(403);
    await write(scoped, 'post', `/teams/${team.id}/openings`, openingValues).expect(403);
  }
  await write(scoped, 'put', `/organizations/${orgA.id}`, orgValues).expect(403);
  await scoped.agent.get(`/api/organizations/${orgA.id}/roles`).expect(403);
  await write(scoped, 'post', `/organizations/${orgA.id}/roles`, { email: scoped.email }).expect(403);
  await write(scoped, 'delete', `/organizations/${orgA.id}/roles`, { userId: owner.id }).expect(403);
  await write(scoped, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, gameId: game.id }).expect(403);
  const foreign = await createOpening(outsider, teamB);
  await write(scoped, 'put', `/openings/${foreign.id}`, openingValues).expect(403);
  await write(scoped, 'post', `/openings/${foreign.id}/close`, {}).expect(403);
});

test('SF-19–20 publish, persist, edit, derive game, and close without deleting or reopening', async () => {
  const opening = await createOpening(scoped); openingDTO.parse(opening);
  assert.equal(opening.game, game.id); assert.equal(opening.status, 'active'); assert.equal(opening.deadline, '2099-11-04T20:59:00.000Z');
  const edited = (await write(scoped, 'put', `/openings/${opening.id}`, { ...openingValues, role: 'Captain' }).expect(200)).body.opening;
  openingDTO.parse(edited); assert.equal(edited.role, 'Captain'); assert.equal((await get(`/openings/${opening.id}`)).body.opening.role, 'Captain');
  await write(visitor, 'put', `/openings/${opening.id}`, openingValues).expect(401);
  await write(visitor, 'post', `/openings/${opening.id}/close`, {}).expect(401);
  await write(outsider, 'put', `/openings/${opening.id}`, openingValues).expect(403);
  await write(outsider, 'post', `/openings/${opening.id}/close`, {}).expect(403);
  const closed = (await write(scoped, 'post', `/openings/${opening.id}/close`, {}).expect(200)).body.opening;
  openingDTO.parse(closed); assert.equal(closed.status, 'closed'); assert.ok(closed.closedAt);
  const again = (await write(scoped, 'post', `/openings/${opening.id}/close`, {}).expect(200)).body.opening;
  assert.equal(again.closedAt, closed.closedAt);
  await write(scoped, 'put', `/openings/${opening.id}`, openingValues).expect(409);
  assert.equal((await get(`/openings/${opening.id}`).expect(200)).body.opening.status, 'closed');
  assert.equal((await Opening.findById(opening.id)).closedBy.toString(), scoped.id);
});

test('SF-20 invalid requirements/deadlines and injected game/status/team cannot persist', async () => {
  const beforeCount = await Opening.countDocuments();
  const invalid = [ { role: '' }, { requirements: ' ' }, { requirements: 'x'.repeat(2001) }, { platform: 'invalid' }, { rank: 'x'.repeat(101) }, { region: '' }, { language: '' }, { schedule: '' }, { timezone: 'Mars/City' }, { deadline: '2020-01-01T00:00:00Z' }, { deadline: '2099-02-30T20:00:00Z' }, { deadline: '2099-11-04T23:59:00' }, { deadline: 'not-a-date' }, { game: otherGame.id }, { gameId: otherGame.id }, { team: sibling.id }, { status: 'closed' }, { createdBy: outsider.id } ];
  for (const values of invalid) await write(owner, 'post', `/teams/${teamA.id}/openings`, { ...openingValues, ...values }).expect(400);
  assert.equal(await Opening.countDocuments(), beforeCount);
  const opening = await createOpening();
  for (const values of [{ role: ' ' }, { game: otherGame.id }, { deadline: '2020-01-01T00:00:00Z' }]) await write(owner, 'put', `/openings/${opening.id}`, { ...openingValues, ...values }).expect(400);
  await write(owner, 'post', `/openings/${opening.id}/close`, { status: 'active' }).expect(400);
  await get('/openings/bad').expect(404); await write(owner, 'put', `/openings/${new mongoose.Types.ObjectId()}`, openingValues).expect(404);
});

test('SF-21 active filtering combines literal game/role/region/language and excludes closed/expired', async () => {
  const active = await createOpening(owner, sibling, { ...openingValues, role: 'Sentinel [unique]', language: 'Japanese', region: 'Asia' });
  const expired = await createOpening(); await Opening.updateOne({ _id: expired.id }, { $set: { deadline: new Date('2020-01-01') } });
  const closed = await createOpening(); await write(owner, 'post', `/openings/${closed.id}/close`, {}).expect(200);
  const all = (await get('/openings').expect(200)).body.openings;
  assert.ok(all.some(opening => opening.id === active.id)); assert.ok(!all.some(opening => [expired.id, closed.id].includes(opening.id)));
  const filtered = (await get(`/openings?game=${otherGame.id}&role=%5Bunique%5D&region=asia&language=jap`).expect(200)).body.openings;
  assert.deepEqual(filtered.map(opening => opening.id), [active.id]);
  assert.equal(filtered[0].gameName, 'Valorant'); assert.equal(filtered[0].organizationName, 'Falcons');
  assert.equal((await get('/openings?role=.%2A').expect(200)).body.openings.length, 0);
  assert.equal((await get('/openings?role=NoMatchingRole').expect(200)).body.openings.length, 0);
  for (const query of ['game=bad', 'role=', 'region[$ne]=x', 'status=closed', 'language=' + 'x'.repeat(101)]) await get(`/openings?${query}`).expect(400);
  const teamPage = (await get(`/teams/${teamA.id}`).expect(200)).body;
  assert.ok(!teamPage.openings.some(opening => [expired.id, closed.id].includes(opening.id)));
  assert.equal((await get(`/openings/${expired.id}`)).body.opening.expired, true);
  const managed = (await owner.agent.get('/api/management')).body.openings;
  assert.ok(managed.some(opening => opening.id === expired.id)); assert.ok(managed.some(opening => opening.id === closed.id));
});

test('SF-18 team revocation takes effect in the existing session immediately', async () => {
  const opening = await createOpening(scoped);
  await write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: scoped.id, teamId: teamA.id }).expect(204);
  await write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: scoped.id, teamId: teamA.id }).expect(204);
  await write(scoped, 'put', `/teams/${teamA.id}`, teamValues).expect(403);
  await write(scoped, 'put', `/openings/${opening.id}`, openingValues).expect(403);
  await write(scoped, 'post', `/openings/${opening.id}/close`, {}).expect(403);
  await write(scoped, 'post', `/teams/${teamA.id}/openings`, openingValues).expect(403);
  assert.equal((await scoped.agent.get('/api/management')).body.teams.length, 0);
});

test('SF-18 organization-wide grant/revoke; atomic concurrent removal retains a manager', async () => {
  await write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: owner.id }).expect(409);
  await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: secondManager.email }).expect(204);
  await write(secondManager, 'put', `/teams/${sibling.id}`, teamValues).expect(200);
  await createOpening(secondManager, sibling);
  await write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: secondManager.id }).expect(204);
  await write(secondManager, 'put', `/teams/${sibling.id}`, teamValues).expect(403);
  await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: secondManager.email }).expect(204);
  const results = await Promise.all([write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: owner.id }), write(secondManager, 'delete', `/organizations/${orgA.id}/roles`, { userId: secondManager.id })]);
  assert.equal(results.filter(result => result.status === 204).length, 1);
  assert.ok([403, 409].includes(results.find(result => result.status !== 204).status));
  assert.equal((await Organization.findById(orgA.id)).managers.length, 1);
});

test('SF-14–21 data and permissions survive MongoDB restart and a fresh login', async () => {
  const preserved = await createOpening(outsider, teamB);
  await app.locals.sessionStore.close(); await mongoose.disconnect();
  await mongo.stop({ doCleanup: false, force: true }); await mongo.start();
  config.mongoUri = mongo.getUri('recruitment'); await connectDatabase(config.mongoUri); app = createApp(config);
  const actor = await newVisitor(); const response = await write(actor, 'post', '/auth/login', { email: outsider.email, password }).expect(200); actor.token = response.body.csrfToken;
  const managed = (await actor.agent.get('/api/management').expect(200)).body;
  assert.equal(managed.organizations[0].id, orgB.id); assert.equal(managed.teams[0].id, teamB.id); assert.ok(managed.openings.some(opening => opening.id === preserved.id));
  await write(actor, 'put', `/openings/${preserved.id}`, { ...openingValues, role: 'Restored after restart' }).expect(200);
  assert.equal((await get(`/openings/${preserved.id}`)).body.opening.role, 'Restored after restart');
});
