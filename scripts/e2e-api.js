import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/db.js';
import { User } from '../server/modules/auth/model.js';
import { PlayerProfile, PlayerGame } from '../server/modules/profiles/model.js';
import { Game } from '../server/modules/games/model.js';
import { seedGames } from '../server/modules/games/catalog.js';
import { createTournamentSearch } from '../server/modules/games/tournaments.js';
import { fixtureFetch } from '../tests/fixtures/competition-provider.js';

await mkdir('.local-data', { recursive: true });
const directory = await mkdtemp(resolve('.local-data/browser-'));
const mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: resolve('.local-data/mongodb-binaries') }, instance: { dbName: 'rosterlink_browser', storageEngine: 'wiredTiger' } });
const mongoUri = mongo.getUri('rosterlink_browser');
await connectDatabase(mongoUri);
await Promise.all([User.init(), PlayerProfile.init(), PlayerGame.init(), Game.init()]);
await seedGames();
await Game.create({ slug: 'local-valorant', providerId: 26, name: 'Valorant', enabled: true, schemaVersion: 2, fields: [] });
await Game.create({ slug: 'local-mobile-legends', providerId: 34, name: 'Mobile Legends: Bang Bang', enabled: true, schemaVersion: 2, fields: [] });
// Deterministic provider fixtures; browser tests never spend provider quota or use a real token.
const tournamentSearch = createTournamentSearch({ token: 'browser-tests-only', fetchImpl: fixtureFetch });
// Test-process injection only: capture mail in ignored artifacts, never expose an inbox API.
const mailbox = resolve('.local-data/e2e-reset-mailbox');
await mkdir(mailbox, { recursive: true });
const resetMailer = async message => {
  if (!/^recovery-[a-z0-9-]+@example\.com$/.test(message.email)) return;
  await writeFile(join(mailbox, `${message.email}.json`), JSON.stringify(message), { mode: 0o600 });
};
const app = createApp({ mongoUri, sessionSecret: 'browser-tests-only-secret-'.repeat(3), uploadDir: join(directory, 'images'), origin: 'http://127.0.0.1:5174', tournamentSearch, resetMailer });
const server = app.listen(3002, '127.0.0.1', () => console.log('Browser test API ready. Uses an isolated real MongoDB database.'));
const stop = () => server.close(async () => {
  await app.locals.sessionStore.close(); await mongoose.disconnect(); await mongo.stop();
  if (dirname(directory) !== resolve('.local-data')) throw new Error('Refusing cleanup outside the workspace test-data root');
  await rm(directory, { recursive: true, force: true }); process.exit(0);
});
process.once('SIGINT', stop); process.once('SIGTERM', stop);
