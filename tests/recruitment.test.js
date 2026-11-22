import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, access, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/db.js';
import { User } from '../server/modules/auth/model.js';
import { Game } from '../server/modules/games/model.js';
import { seedGames } from '../server/modules/games/catalog.js';
import { Organization, Team, Opening, recruitmentModels } from '../server/modules/recruitment/models.js';
import { Post, PostComment, postModels } from '../server/modules/posts/models.js';

const password = 'Sprint Two test passphrase!';
const orgValues = { name: 'Falcons', description: 'Competitive esports organization — فريق', region: 'Saudi Arabia', website: 'https://example.com' };
const teamValues = { name: 'Falcons Rocket League', description: 'Our first game team.' };
const openingValues = { role: 'Rotation player', requirements: 'Rocket League: competitive 3v3 rotation and replay review.', platform: 'PC', rank: 'Champion or equivalent', region: 'Middle East', language: 'Arabic / English', scheduleSlots: [{ day: 'sun', start: '20:00', end: '23:00' }], timezone: 'Asia/Riyadh', deadline: '2099-11-04T23:59:00+03:00' };
const identifier = z.string().regex(/^[a-f\d]{24}$/);
const openingDTO = z.object({ id: identifier, team: identifier, game: identifier, role: z.string(), requirements: z.string(), platform: z.string(), rank: z.string(), region: z.string(), language: z.string(), schedule: z.string(), scheduleSlots: z.array(z.object({ day: z.string(), start: z.string(), end: z.string() }).strict()), timezone: z.string(), deadline: z.iso.datetime(), status: z.enum(['active', 'closed']), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), closedAt: z.iso.datetime().optional() }).strict();
let mongo, directory, app, config, owner, outsider, scoped, secondManager, visitor, game, otherGame, orgA, orgB, teamA, sibling, teamB;
const write = (actor, method, path, values) => actor.agent[method](`/api${path}`).set('X-CSRF-Token', actor.token).send(values);
const get = path => request(app).get(`/api${path}`);
async function newVisitor() { const agent = request.agent(app); const response = await agent.get('/api/auth/session').expect(200); return { agent, token: response.body.csrfToken }; }
async function register(email) { const actor = await newVisitor(); const response = await write(actor, 'post', '/auth/register', { email, password }).expect(201); return { ...actor, token: response.body.csrfToken, id: response.body.user.id, email }; }
const createOpening = async (actor = owner, team = teamA, values = openingValues) => (await write(actor, 'post', `/teams/${team.id}/openings`, values).expect(201)).body.opening;
const png = () => sharp({ create: { width: 12, height: 12, channels: 3, background: '#c4aaff' } }).png().toBuffer();
const upload = (actor, path, image) => actor.agent.post(`/api${path}`).set('X-CSRF-Token', actor.token).attach('image', image, { filename: 'logo.png', contentType: 'image/png' });

test('SF-22–29 track one application, protect recruiter actions, and atomically notify each side', async () => {
  const player = await register('sprint-three-applicant@example.com');
  const profile = (await write(player, 'post', '/profiles', {
    displayName: 'Sprint Three Applicant', bio: '', region: 'Riyadh', languages: ['English'],
  }).expect(201)).body.profile;
  await upload(player, `/profiles/${profile.id}/images/profile`, await png()).expect(200);
  await write(player, 'post', `/profiles/${profile.id}/games`, { gameId: game.id,
    details: { platform: 'PC', server: 'Middle East', language: 'English', rank: 'Champion I', availability: 'Evenings' },
  }).expect(201);
  // This same account can manage an unrelated organization and apply as a player.
  const playerOrg = (await write(player, 'post', '/organizations', { ...orgValues, name: 'Applicant Organization' }).expect(201)).body.organization;
  await write(player, 'post', `/organizations/${playerOrg.id}/teams`, { ...teamValues, gameId: game.id }).expect(201);
  const opening = await createOpening();
  await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: scoped.email, teamId: teamA.id }).expect(204);
  const target = `/applications/opening/${opening.id}`;
  const values = { introduction: 'I can help with rotation.', availability: 'After 20:00 Asia/Riyadh', submissionId: randomUUID() };
  await write(outsider, 'post', target, values).expect(400);
  await write(player, 'post', target, { ...values, introduction: ' ' }).expect(400);
  await write(player, 'post', target, { ...values, status: 'accepted' }).expect(400);
  await player.agent.post(`/api${target}`).send(values).expect(403);
  const attempts = [values, { ...values, submissionId: randomUUID() }];
  const concurrent = await Promise.all(attempts.map(body => write(player, 'post', target, body)));
  assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
  const applicationId = concurrent.find(response => response.status === 201).body.id;
  const original = attempts[concurrent.findIndex(response => response.status === 201)];
  assert.equal((await write(player, 'post', target, original).expect(200)).body.id, applicationId);
  const detail = `/applications/detail/${applicationId}`;
  const action = (actor, action, revision) => write(actor, 'post', detail + '/action', { action, revision });
  const inbox = async actor => (await actor.agent.get('/api/applications/notifications').expect(200)).body.notifications.filter(item => item.applicationId === applicationId);
  const review = `/api/applications/review/${opening.id}`;
  await get(detail).expect(401);
  await outsider.agent.get(`/api${detail}`).expect(404);
  await outsider.agent.get(review).expect(403);
  assert.deepEqual(await inbox(outsider), []);
  const managerList = (await owner.agent.get(review + '?status=submitted').expect(200)).body.applications;
  assert.equal(managerList.length, 1);
  assert.equal(managerList[0].profile.id, profile.id);
  assert.equal(managerList[0].profile.name, profile.displayName);
  assert.equal(managerList[0].profile.rank, 'Champion I');
  assert.equal(managerList[0].profile.region, 'Riyadh');
  await request(app).get(managerList[0].profile.avatarUrl).expect(200);
  await write(player, 'patch', `/profiles/${profile.id}/settings`, { publicFields: { rank: false, region: false, profileImage: false } }).expect(200);
  const hiddenProfile = (await owner.agent.get(review).expect(200)).body.applications[0].profile;
  assert.deepEqual(hiddenProfile, { id: profile.id, name: profile.displayName, avatarUrl: null });
  const managedOpening = (await owner.agent.get('/api/management').expect(200)).body.openings.find(item => item.id === opening.id);
  assert.deepEqual(managedOpening.applicantCounts, { total: 1, submitted: 1 });
  assert.equal(managerList[0].player, undefined);
  assert.equal(managerList[0].events, undefined);
  const [submitted] = await inbox(owner);
  assert.equal(submitted.kind, 'submitted');
  const unread = async actor => (await actor.agent.get('/api/applications/notifications/unread').expect(200)).body.unread;
  assert.equal(await unread(owner), true);
  assert.equal(await unread(outsider), false);
  assert.equal((await inbox(scoped))[0].kind, 'submitted');
  await write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: scoped.id, teamId: teamA.id }).expect(204);
  assert.equal(await unread(scoped), false);
  assert.deepEqual(await inbox(scoped), []);
  await scoped.agent.get(`/api${detail}`).expect(404);
  await write(owner, 'post', `/applications/notifications/${applicationId}/read`, { eventId: submitted.id }).expect(204);
  assert.equal((await inbox(owner))[0].read, true);
  assert.equal(await unread(owner), false);
  await action(player, 'shortlist', 0).expect(403);
  await action(owner, 'withdraw', 0).expect(403);
  await action(owner, 'review', 0).expect(200);
  const shortlist = await Promise.all([action(owner, 'shortlist', 1), action(owner, 'shortlist', 1)]);
  assert.deepEqual(shortlist.map(response => response.status).sort(), [200, 409]);
  await write(owner, 'post', `/openings/${opening.id}/close`, {}).expect(200);
  await write(player, 'post', target, { ...values, submissionId: randomUUID() }).expect(409);
  await write(owner, 'post', detail + '/invitation', { revision: 2, startsAt: '2001-01-01T01:00:00Z', timeZone: 'Asia/Riyadh', notes: 'Training lobby' }).expect(400);
  const invite = (await write(owner, 'post', detail + '/invitation', {
    revision: 2, startsAt: '2099-11-05T20:00:00+03:00', timeZone: 'Asia/Riyadh', notes: 'Training lobby',
  }).expect(200)).body.application;
  assert.equal(invite.invitation.startsAt, '2099-11-05T17:00:00.000Z');
  await action(player, 'attend', 2).expect(409);
  await action(player, 'attend', 3).expect(200);
  await action(player, 'decline', 3).expect(409);
  assert.equal((await owner.agent.get(`/api${detail}`).expect(200)).body.application.invitation.status, 'attending');
  await action(owner, 'accept', 4).expect(200);
  await action(player, 'withdraw', 5).expect(409);
  const myApps = (await player.agent.get('/api/applications').expect(200)).body.applications;
  assert.equal(myApps[0].status, 'accepted');
  const { history } = (await player.agent.get(`/api${detail}`).expect(200)).body.application;
  assert.deepEqual(history.map(item => item.kind), ['submitted', 'reviewing', 'shortlisted', 'invited', 'attending', 'accepted']);
  assert.ok(history.every(event => Object.keys(event).sort().join(',') === 'date,kind'));
  assert.deepEqual((await inbox(player)).map(item => item.kind).sort(), ['accepted', 'invited', 'reviewing', 'shortlisted']);
  assert.deepEqual((await inbox(owner)).map(item => item.kind).sort(), ['attending', 'submitted']);

  const withdrawalOpening = await createOpening();
  const withdrawalTarget = `/applications/opening/${withdrawalOpening.id}`;
  const withdrawal = (await write(player, 'post', withdrawalTarget, { ...values, submissionId: randomUUID() }).expect(201)).body.id;
  const withdrawn = await write(player, 'post', `/applications/detail/${withdrawal}/action`, { action: 'withdraw', revision: 0 }).expect(200);
  assert.equal(withdrawn.body.application.status, 'withdrawn');
  const second = (await write(player, 'post', withdrawalTarget, { ...values, submissionId: randomUUID() }).expect(201)).body.id;
  const secondPath = `/applications/detail/${second}`;
  await write(owner, 'post', secondPath + '/action', { action: 'shortlist', revision: 0 }).expect(200);
  await write(owner, 'post', secondPath + '/invitation', { revision: 1, startsAt: '2099-11-06T17:00:00Z', timeZone: 'Asia/Riyadh', notes: 'Training lobby' }).expect(200);
  await write(player, 'post', secondPath + '/action', { action: 'decline', revision: 2 }).expect(200);
  const rejected = await write(owner, 'post', secondPath + '/action', { action: 'reject', revision: 3 }).expect(200);
  assert.equal(rejected.body.application.status, 'rejected');
  assert.equal(rejected.body.application.invitation.status, 'declined');
  await write(owner, 'post', `/openings/${withdrawalOpening.id}/close`, {}).expect(200);
});

test('profile affiliations are individually private until published and disappear when the role is revoked', async () => {
  const profile = (await write(scoped, 'post', '/profiles', { displayName: 'Scoped Player', bio: '', region: 'Riyadh', languages: ['English'] }).expect(201)).body.profile;
  const path = `/profiles/${profile.id}/affiliations`;
  const key = `team:${teamA.id}`;
  const publicProfile = async () => (await get(`/public/profiles/${profile.id}`).expect(200)).body.profile;
  await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: scoped.email, teamId: teamA.id }).expect(204);
  assert.equal((await publicProfile()).affiliations, undefined);
  await write(outsider, 'patch', path, { key, published: true }).expect(404);
  await write(scoped, 'patch', path, { key: `organization:${orgA.id}`, published: true }).expect(409);
  await write(scoped, 'patch', path, { key, published: true }).expect(204);
  assert.deepEqual((await publicProfile()).affiliations.map(item => [item.role, item.teamId]), [['Team manager', teamA.id]]);
  await write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: scoped.id, teamId: teamA.id }).expect(204);
  assert.equal((await publicProfile()).affiliations, undefined);
  await write(scoped, 'patch', path, { key, published: true }).expect(409);
});

before(async () => {
  await mkdir('.local-data', { recursive: true }); directory = await mkdtemp(resolve('.local-data/recruitment-')); await mkdir(join(directory, 'mongo'));
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: resolve('.local-data/mongodb-binaries') }, instance: { dbName: 'recruitment', dbPath: join(directory, 'mongo'), storageEngine: 'wiredTiger' } });
  config = { mongoUri: mongo.getUri('recruitment'), sessionSecret: 'sprint-two-tests-only-secret-'.repeat(3), uploadDir: join(directory, 'images'), origin: 'http://127.0.0.1:5173' };
  await connectDatabase(config.mongoUri); await Promise.all([User, Game, ...recruitmentModels, ...postModels].map(model => model.init())); await seedGames();
  game = await Game.findOne({ slug: 'rocket-league' }); otherGame = await Game.create({ slug: 'test-valorant', name: 'Valorant', schemaVersion: 2 });
  app = createApp(config); owner = await register('owner@example.com'); outsider = await register('other-org@example.com'); scoped = await register('team-manager@example.com'); secondManager = await register('org-manager@example.com'); visitor = await newVisitor();
  orgA = (await write(owner, 'post', '/organizations', orgValues).expect(201)).body.organization;
  orgB = (await write(outsider, 'post', '/organizations', { ...orgValues, name: 'Wolves' }).expect(201)).body.organization;
  teamA = (await write(owner, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, gameId: game.id }).expect(201)).body.team;
  sibling = (await write(owner, 'post', `/organizations/${orgA.id}/teams`, { ...teamValues, name: 'Falcons Valorant', gameId: otherGame.id }).expect(201)).body.team;
  teamB = (await write(outsider, 'post', `/organizations/${orgB.id}/teams`, { ...teamValues, name: 'Wolves RL', gameId: game.id }).expect(201)).body.team;
}, { timeout: 240000 });
after(async () => { await app?.locals.sessionStore.close(); await mongoose.disconnect(); await mongo?.stop(); if (directory) { assert.equal(dirname(directory), resolve('.local-data')); await rm(directory, { recursive: true, force: true }); } });

test('organization logos are public and only an organization manager can upload, replace, or remove them', async () => {
  const path = `/organizations/${orgA.id}/logo`;
  const image = await png();
  await get(path).expect(404);
  await upload(visitor, path, image).expect(401);
  await upload(outsider, path, image).expect(403);
  await write(owner, 'post', `/organizations/${orgA.id}/roles`, { email: scoped.email, teamId: teamA.id }).expect(204);
  await upload(scoped, path, image).expect(403);
  await upload(owner, path, Buffer.from('not an image')).expect(400);
  const saved = (await upload(owner, path, image).expect(200)).body.organization;
  assert.equal(saved.logoImage, undefined);
  assert.match(saved.logoUrl, /\/logo\?v=\d+$/);
  await request(app).get(saved.logoUrl).expect('Content-Type', /image\/webp/).expect(200);
  const previous = (await Organization.findById(orgA.id)).logoImage;
  await upload(owner, path, image).expect(200);
  await assert.rejects(access(join(config.uploadDir, previous)), { code: 'ENOENT' });
  const replacement = (await Organization.findById(orgA.id)).logoImage;
  assert.equal((await get(`/organizations/${orgA.id}`).expect(200)).body.organization.logoImage, undefined);
  assert.ok((await get(`/teams/${teamA.id}`).expect(200)).body.team.organizationLogoUrl);
  await write(scoped, 'delete', path).expect(403);
  assert.equal((await write(owner, 'delete', path).expect(200)).body.organization.logoUrl, null);
  await get(path).expect(404);
  await assert.rejects(access(join(config.uploadDir, replacement)), { code: 'ENOENT' });
  await write(owner, 'delete', `/organizations/${orgA.id}/roles`, { userId: scoped.id, teamId: teamA.id }).expect(204);
});

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

test('SF-20 structured schedules persist, reject invalid/overlapping slots, and preserve old text records', async () => {
  const slots = [{ day: 'fri', start: '22:00', end: '02:00' }, { day: 'sun', start: '20:15', end: '23:45' }];
  const opening = await createOpening(owner, teamA, { ...openingValues, scheduleSlots: slots });
  assert.equal(opening.schedule, 'Sun 20:15–23:45; Fri 22:00–02:00 (+1 day)');
  assert.deepEqual(opening.scheduleSlots, [slots[1], slots[0]]);
  assert.deepEqual((await get(`/openings/${opening.id}`)).body.opening.scheduleSlots, opening.scheduleSlots);
  const invalid = [[], null, 'Sun 8pm', [{ day: 'noday', start: '20:00', end: '23:00' }], [{ day: 'sun', start: '25:00', end: '23:00' }], [{ day: 'sun', start: '20:01', end: '23:00' }], [{ day: 'sun', start: '20:00', end: '20:00' }], [slots[0], slots[0]], [{ ...slots[0], extra: 'bad' }], [{ day: 'sat', start: '23:00', end: '02:00' }, { day: 'sun', start: '01:00', end: '03:00' }]];
  for (const scheduleSlots of invalid) {
    await write(owner, 'post', `/teams/${teamA.id}/openings`, { ...openingValues, scheduleSlots }).expect(400);
    await write(owner, 'put', `/openings/${opening.id}`, { ...openingValues, scheduleSlots }).expect(400);
  }
  const { scheduleSlots, ...withoutSchedule } = openingValues;
  await write(owner, 'post', `/teams/${teamA.id}/openings`, withoutSchedule).expect(400);
  await write(owner, 'post', `/teams/${teamA.id}/openings`, { ...withoutSchedule, schedule: 'Sunday whenever' }).expect(400);
  const legacy = await Opening.create({ ...withoutSchedule, schedule: 'Old Friday evening text', team: teamA.id, game: game.id, createdBy: owner.id, updatedBy: owner.id });
  assert.equal((await get(`/openings/${legacy.id}`)).body.opening.schedule, 'Old Friday evening text');
  await write(owner, 'put', `/openings/${legacy.id}`, openingValues).expect(200);
  const updated = (await get(`/openings/${legacy.id}`)).body.opening;
  assert.equal(updated.schedule, 'Sun 20:00–23:00'); assert.deepEqual(updated.scheduleSlots, openingValues.scheduleSlots);
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

test('SF-16/17/34: posts follow current ownership and management scope, with public identities and private account data', async () => {
  const club = (await write(owner, 'post', '/organizations', { ...orgValues, name: 'Post Test Club' }).expect(201)).body.organization;
  const addTeam = async name => (await write(owner, 'post', `/organizations/${club.id}/teams`,
    { ...teamValues, name, gameId: game.id }).expect(201)).body.team;
  const team = await addTeam('Scoped roster'), otherTeam = await addTeam('Sibling roster');
  const rolesPath = `/organizations/${club.id}/roles`;
  await write(owner, 'post', rolesPath, { email: scoped.email, teamId: team.id }).expect(204);
  const player = await register('post-author@example.test');
  const member = await register('post-visitor@example.test');
  const profile = (await write(player, 'post', '/profiles', {
    displayName: 'Private Avatar Pilot', region: 'Riyadh', languages: ['English'], bio: '',
  }).expect(201)).body.profile;
  await upload(player, `/profiles/${profile.id}/images/profile`, await png()).expect(200);
  await write(player, 'patch', `/profiles/${profile.id}/settings`, { publicFields: { profileImage: false } }).expect(200);
  const byPlayer = `/posts/by/player/${profile.id}`, byOrg = `/posts/by/organization/${club.id}`, byTeam = `/posts/by/team/${team.id}`;
  const update = { body: 'Practice update · تمرين' };
  await write(visitor, 'post', byPlayer, update).expect(401);
  await write(outsider, 'post', byPlayer, update).expect(403);
  await write(scoped, 'post', byOrg, update).expect(403);
  await write(scoped, 'post', `/posts/by/team/${otherTeam.id}`, update).expect(403);
  await write(owner, 'post', byOrg, { body: ' ', authorKind: 'player' }).expect(400);
  await write(owner, 'post', byOrg, { body: 'x'.repeat(2001) }).expect(400);
  await write(owner, 'post', byOrg, update).expect(201);
  const teamPost = (await write(scoped, 'post', byTeam, update).expect(201)).body.post;
  const playerPost = (await write(player, 'post', byPlayer, { body: '  Review notes  ' }).expect(201)).body.post;
  assert.equal(playerPost.body, 'Review notes');
  const publicPlayer = (await get(byPlayer).expect(200)).body;
  assert.deepEqual(publicPlayer.author, { kind: 'player', name: 'Private Avatar Pilot', url: `/p/${profile.id}`, imageUrl: null });
  assert.equal(publicPlayer.canPublish, false);
  assert.equal(publicPlayer.posts[0].authorId, undefined);
  const publicTeam = (await get(byTeam).expect(200)).body;
  assert.equal(publicTeam.author.url, `/teams/${team.id}`);
  assert.equal(publicTeam.posts[0].id, teamPost.id);
  assert.equal((await scoped.agent.get('/api' + byTeam).expect(200)).body.canPublish, true);
  await write(owner, 'patch', `/posts/${teamPost.id}`, { body: 'Revised as an organization manager.' }).expect(200);
  await write(owner, 'delete', rolesPath, { userId: scoped.id, teamId: team.id }).expect(204);
  await write(scoped, 'patch', `/posts/${teamPost.id}`, update).expect(403);
  await write(scoped, 'delete', `/posts/${teamPost.id}`).expect(403);

  const path = `/posts/${playerPost.id}`;
  const reactions = await Promise.all([write(member, 'put', path + '/reaction'), write(member, 'put', path + '/reaction')]);
  assert.ok(reactions.every(result => result.status === 200 && result.body.reactionCount === 1 && result.body.reacted));
  assert.equal((await member.agent.get('/api' + byPlayer).expect(200)).body.posts[0].reacted, true);
  assert.deepEqual((await write(member, 'delete', path + '/reaction').expect(200)).body, { reactionCount: 0, reacted: false });
  const comment = (await write(member, 'post', path + '/comments', { body: 'Thanks for sharing.' }).expect(201)).body.comment;
  assert.equal(comment.author.name, 'RosterLink member');
  assert.equal(comment.author.url, null);
  assert.equal(comment.canDelete, true);
  const discussion = (await get(path + '/comments').expect(200)).body;
  assert.equal(discussion.commentCount, 1);
  assert.equal(discussion.comments[0].canDelete, false);
  assert.equal(discussion.comments[0].user, undefined);
  await write(player, 'delete', path + '/comments/' + comment.id).expect(403);
  assert.equal((await write(member, 'delete', path + '/comments/' + comment.id).expect(200)).body.commentCount, 0);
  await write(member, 'post', path + '/comments', { body: 'A second note.' }).expect(201);
  await write(player, 'delete', path).expect(204);
  await get(path + '/comments').expect(404);
  await write(member, 'put', path + '/reaction').expect(404);
  assert.equal((await get(byPlayer).expect(200)).body.posts.length, 0);
});

test('post and comment cursors preserve stable ordering when publication times match', async () => {
  const path = `/posts/by/organization/${orgB.id}`;
  const before = new Date();
  const posts = await Post.insertMany(Array.from({ length: 14 }, (_, index) => ({
    authorKind: 'organization', authorId: orgB.id, body: 'Update ' + index, createdAt: before,
  })));
  const findAllPages = async (url, key, firstPageLength, total) => {
    const first = (await get(url).expect(200)).body;
    assert.equal(first[key].length, firstPageLength);
    const second = (await get(url + '?' + new URLSearchParams({ before: first.nextCursor })).expect(200)).body;
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first[key], ...second[key]].map(item => item.id)).size, total);
  };
  await findAllPages(path, 'posts', 12, 14);
  await get(path + '?before=invalid').expect(400);
  await PostComment.insertMany(Array.from({ length: 17 }, (_, index) => ({
    post: posts[0]._id, user: owner.id, body: 'Comment ' + index, createdAt: before,
  })));
  await findAllPages(`/posts/${posts[0].id}/comments`, 'comments', 15, 17);
});

test('Feed scopes, full-set search, stable cursors and personal follow relationships', async () => {
  const fan = await register('feed-reader@example.test');
  const profile = (await write(fan, 'post', '/profiles', {
    displayName: 'Feed Scout', region: 'Riyadh', languages: ['Arabic'], bio: '',
  }).expect(201)).body.profile;
  const club = await Organization.create({ ...orgValues, name: 'Discovery Club', managers: [owner.id] });
  const team = await Team.create({ ...teamValues, name: 'Discovery Squad', game: game._id, organization: club._id });
  const target = '/discovery/team/' + team.id;
  const timeline = async params => (await fan.agent.get('/api/discovery/feed').query(params).expect(200)).body;
  assert.equal((await timeline({})).tab, 'all');
  await write(visitor, 'put', target, {}).expect(401);
  await write(fan, 'put', '/discovery/player/' + profile.id, {}).expect(400);
  await Promise.all([1,2].map(() => write(fan, 'put', target, {}).expect(200)));
  assert.equal((await get(target)).body.followers, 1);
  assert.equal((await get(target + '/followers')).body.accounts[0].url, '/p/' + profile.id);
  assert.equal((await get('/discovery/player/' + profile.id + '/following')).body.accounts[0].url, '/teams/' + team.id);
  const rows = await Post.insertMany(Array.from({ length: 15 }, (_, i) => ({
    authorKind: 'team', authorId: team._id, body: i === 0 ? 'earliest [replay]' : 'Practice notes',
    createdAt: new Date(Date.UTC(2024,0,1+i)),
  })));
  await Post.create({ authorKind: 'organization', authorId: club._id, body: 'Club only' });
  await write(owner, 'patch', '/posts/' + rows[0].id, {body:'edited [replay]'}).expect(200);
  const first = await timeline({ q: 'Discovery' });
  assert.equal(first.tab, 'following');
  assert.deepEqual(first.posts.map(p => p.id), rows.slice(-12).reverse().map(p => p.id));
  const last = await timeline({ q: 'Discovery', tab:'following', before:first.nextCursor });
  assert.deepEqual(last.posts.map(p => p.id), rows.slice(0,3).reverse().map(p => p.id));
  assert.equal((await timeline({ q:'[replay]' })).posts[0].id, rows[0].id);
  assert.equal((await timeline({ q:'Club only' })).posts.length,0);
  assert.equal((await timeline({ q:'Club only', tab:'all' })).posts.length,1);
  assert.equal((await get('/discovery/accounts?q=%40Discovery%20Squad')).body.accounts[0].id,team.id);
  await write(fan,'delete',target,{}).expect(200);
  assert.equal((await timeline({tab:'following'})).posts.length,0);
  assert.equal((await timeline({})).tab,'all');
  assert.equal((await get(target)).body.followers,0);
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
