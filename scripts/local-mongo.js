import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Despite the library name this starts a real mongod with persistent WiredTiger files.
const dbPath = resolve('.local-data/mongo');
await mkdir(dbPath, { recursive: true });
const mongo = await MongoMemoryServer.create({
  binary: { version: '8.0.17', downloadDir: resolve('.local-data/mongodb-binaries') },
  instance: { port: 27017, portGeneration: false, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger', dbName: 'rosterlink' },
});
console.log(`Persistent local MongoDB: ${mongo.getUri('rosterlink')}`);
console.log(`Data directory: ${dbPath}. Stop with Ctrl+C; data is retained.`);
const keepAlive = setInterval(() => {}, 60000);
async function stop() {
  clearInterval(keepAlive);
  await mongo.stop({ doCleanup: false, force: false });
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
