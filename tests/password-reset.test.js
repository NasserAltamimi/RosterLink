import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/db.js';
import { User } from '../server/modules/auth/model.js';
import { hashPassword, verifyPassword } from '../server/modules/auth/passwords.js';
import { createResetMailer, sender } from '../server/mail/smtp.js';

const origin = 'http://127.0.0.1:5173';
const oldPassword = 'Original password phrase!';
const newPassword = 'Replacement password phrase!';
const digest = value => createHash('sha256').update(value).digest('hex');
let mongo, config, app;
const messages = [], apps = [];
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: resolve('.local-data/mongodb-binaries') } });
  config = { mongoUri: mongo.getUri('password_reset'), sessionSecret: 'reset-tests-only-secret-'.repeat(3), uploadDir: resolve('.local-data/reset-test-images'), origin };
  await connectDatabase(config.mongoUri); await User.init();
  app = makeApp({ resetMailer: async message => { messages.push(message); } });
}, { timeout: 180000 });
function makeApp(extra) { const result = createApp({ ...config, ...extra }); apps.push(result); return result; }
after(async () => {
  await Promise.all(apps.map(item => item.locals.sessionStore.close()));
  await mongoose.disconnect(); await mongo?.stop();
});
async function visitor(application = app) {
  const agent = request.agent(application);
  const session = await agent.get('/api/auth/session').expect(200);
  return { agent, csrf: session.body.csrfToken };
}
const post = (visitor, path, body) => visitor.agent.post(`/api/auth/${path}`).set('X-CSRF-Token', visitor.csrf).send(body);
async function account(email) { return User.create({ email, passwordHash: await hashPassword(oldPassword) }); }
async function resetLink(client, email) {
  const count = messages.length;
  await post(client, 'forgot-password', { email }).set('Host', 'attacker.example').expect(202);
  // Wait for the injected mail adapter, never obtain a secret from a normal API.
  for (let i = 0; messages.length === count && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(messages.length, count + 1);
  const link = new URL(messages.at(-1).link);
  assert.equal(link.origin, origin); assert.equal(link.pathname, '/reset-password'); assert.equal(link.search, '');
  return link.hash.slice(1);
}

test('SF-03: request responses match for active, unknown and disabled accounts; only hashes are stored', async () => {
  const user = await account('request@example.com');
  await User.create({ email: 'disabled@example.com', passwordHash: 'unused', status: 'disabled' });
  const client = await visitor();
  const token = await resetLink(client, ' REQUEST@example.com ');
  const known = await post(client, 'forgot-password', { email: user.email }).expect(202);
  const unknown = await post(client, 'forgot-password', { email: 'unknown@example.com' }).expect(202);
  const disabled = await post(client, 'forgot-password', { email: 'disabled@example.com' }).expect(202);
  assert.deepEqual(known.body, unknown.body); assert.deepEqual(known.body, disabled.body);
  assert.deepEqual(Object.keys(known.body), ['message']);
  const stored = await User.findById(user.id).select('+resetTokens');
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(stored.resetTokens[0].hash, digest(token));
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.ok(stored.resetTokens[0].expiresAt > new Date());
  assert.equal((await User.findById(user.id)).resetTokens, undefined);
});

test('SF-03: reset enforces policy/confirmation, consumes every token, revokes all sessions and requires new-password login', async () => {
  const user = await account('reset@example.com');
  const first = await visitor(), second = await visitor(), client = await visitor();
  for (const session of [first, second]) {
    const result = await post(session, 'login', { email: user.email, password: oldPassword }).expect(200);
    session.csrf = result.body.csrfToken;
  }
  const token = await resetLink(client, user.email), otherToken = await resetLink(client, user.email);
  await post(client, 'reset-password/validate', { token }).expect(200);
  const short = await post(client, 'reset-password', { token, password: 'short', confirmPassword: 'short' }).expect(400);
  assert.ok(short.body.fields.password);
  const mismatch = await post(client, 'reset-password', { token, password: newPassword, confirmPassword: oldPassword }).expect(400);
  assert.ok(mismatch.body.fields.confirmPassword);
  await post(client, 'reset-password', { token, password: newPassword, confirmPassword: newPassword }).expect(200);
  await post(client, 'reset-password', { token, password: newPassword, confirmPassword: newPassword }).expect(400);
  await post(client, 'reset-password/validate', { token: otherToken }).expect(400);
  for (const session of [first, second]) {
    await session.agent.get('/api/profiles/me').expect(401);
    assert.equal((await session.agent.get('/api/auth/session')).body.user, null);
  }
  assert.equal((await client.agent.get('/api/auth/session')).body.user, null);
  await post(client, 'login', { email: user.email, password: oldPassword }).expect(401);
  await post(client, 'login', { email: user.email, password: newPassword }).expect(200);
  const stored = await User.findById(user.id).select('+passwordHash +resetTokens');
  assert.equal(stored.resetTokens.length, 0); assert.equal(stored.sessionVersion, 1);
  assert.ok(await verifyPassword(newPassword, stored.passwordHash));
});

test('SF-03: concurrent submissions using different account tokens allow exactly one password update', async () => {
  const user = await account('race@example.com'), client = await visitor();
  const token = await resetLink(client, user.email), other = await resetLink(client, user.email);
  const bodies = [token, token, other].map((token, i) => ({ token, password: `${newPassword}${i}`, confirmPassword: `${newPassword}${i}` }));
  const results = await Promise.all(bodies.map(body => post(client, 'reset-password', body)));
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.ok(results.every(result => [200, 400].includes(result.status)));
  const stored = await User.findById(user.id).select('+passwordHash');
  assert.equal(stored.sessionVersion, 1);
  assert.ok(await verifyPassword(bodies[results.findIndex(result => result.status === 200)].password, stored.passwordHash));
});

test('SF-03: malformed, expired, unknown links and missing CSRF are rejected without changing the password', async () => {
  const user = await account('expired@example.com'), client = await visitor();
  const token = await resetLink(client, user.email);
  await User.updateOne({ _id: user.id }, { $set: { 'resetTokens.0.expiresAt': new Date(Date.now() - 1000) } });
  await post(client, 'reset-password/validate', { token }).expect(410);
  await post(client, 'reset-password', { token, password: newPassword, confirmPassword: newPassword }).expect(410);
  await post(client, 'reset-password/validate', { token: '0'.repeat(64) }).expect(400);
  await post(client, 'reset-password/validate', { token: { $ne: null } }).expect(400);
  await client.agent.post('/api/auth/forgot-password').send({ email: user.email }).expect(403);
  await post(client, 'forgot-password', { email: user.email }).set('Origin', 'https://attacker.example').expect(403);
  assert.ok(await verifyPassword(oldPassword, (await User.findById(user.id).select('+passwordHash')).passwordHash));
});

test('SF-03: both request limiters and shared token-validation/submission limiter are enforced', async () => {
  const limited = makeApp({ resetMailer: async () => {} }), client = await visitor(limited);
  for (let i = 0; i < 5; i++) await post(client, 'forgot-password', { email: 'limit@example.com' }).expect(202);
  await post(client, 'forgot-password', { email: ' LIMIT@example.com ' }).expect(429);
  for (let i = 0; i < 4; i++) await post(client, 'forgot-password', { email: `limit${i}@example.com` }).expect(202);
  await post(client, 'forgot-password', { email: 'another@example.com' }).expect(429);
  for (let i = 0; i < 30; i++) await post(client, 'reset-password/validate', { token: '0'.repeat(64) }).expect(400);
  await post(client, 'reset-password', { token: '0'.repeat(64), password: newPassword, confirmPassword: newPassword }).expect(429);
});

test('SF-03: missing SMTP fails consistently and delivery failures never expose provider secrets', async () => {
  const unavailable = makeApp({ resetMailer: null }), client = await visitor(unavailable);
  const known = await post(client, 'forgot-password', { email: 'reset@example.com' }).expect(503);
  const unknown = await post(client, 'forgot-password', { email: 'absent@example.com' }).expect(503);
  assert.deepEqual(known.body, unknown.body);
  const logs = [], original = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  try {
    const failing = makeApp({ resetMailer: async () => { throw new Error('sensitive-provider-detail'); } });
    await post(await visitor(failing), 'forgot-password', { email: 'reset@example.com' }).expect(202);
    for (let i = 0; logs.length === 0 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(logs, ['Password reset email delivery failed.']);
  } finally { console.error = original; }
});

test('SF-03: Gmail adapter uses encrypted authenticated SMTP and the fixed sender', async () => {
  for (const config of [{ appPassword: 'fixture-only' }, { clientId: 'fixture-id', clientSecret: 'fixture-secret', refreshToken: 'fixture-refresh' }]) {
    let options, message;
    const mailer = createResetMailer(config, value => { options = value; return { sendMail: async value => { message = value; } }; });
    await mailer({ email: 'recipient@example.com', link: `${origin}/reset-password#fixture` });
    assert.equal(options.host, 'smtp.gmail.com'); assert.equal(options.port, 465); assert.equal(options.secure, true);
    assert.equal(options.auth.user, sender); assert.equal(options.logger, false); assert.equal(options.debug, false);
    assert.equal(message.from, `RosterLink <${sender}>`); assert.equal(message.to, 'recipient@example.com');
    assert.match(message.text, /expires in 30 minutes/);
    if (config.clientId) assert.equal(options.auth.type, 'OAuth2');
    else assert.equal(options.auth.pass, config.appPassword);
  }
});
