import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/db.js';
import { User } from '../server/modules/auth/model.js';
import { PlayerProfile, PlayerGame } from '../server/modules/profiles/model.js';
import { Game } from '../server/modules/games/model.js';
import { seedGames } from '../server/modules/games/catalog.js';

await mkdir('.local-data', { recursive: true });
const directory = await mkdtemp(resolve('.local-data/browser-'));
const mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: resolve('.local-data/mongodb-binaries') }, instance: { dbName: 'rosterlink_browser', storageEngine: 'wiredTiger' } });
const mongoUri = mongo.getUri('rosterlink_browser');
await connectDatabase(mongoUri);
await Promise.all([User.init(), PlayerProfile.init(), PlayerGame.init(), Game.init()]);
await seedGames();
const app = createApp({ mongoUri, sessionSecret: 'browser-tests-only-secret-'.repeat(3), uploadDir: join(directory, 'images'), origin: 'http://127.0.0.1:5174' });
const server = app.listen(3002, '127.0.0.1', () => console.log('Browser test API ready. Uses an isolated real MongoDB database.'));
const stop = () => server.close(async () => {
  await app.locals.sessionStore.close(); await mongoose.disconnect(); await mongo.stop();
  await rm(directory, { recursive: true, force: true }); process.exit(0);
});
process.once('SIGINT', stop); process.once('SIGTERM', stop);
