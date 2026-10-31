import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { connectDatabase } from './db.js';
import { createApp } from './app.js';
import { User } from './modules/auth/model.js';
import { Game } from './modules/games/model.js';
import { PlayerProfile, PlayerGame } from './modules/profiles/model.js';
import { recruitmentModels } from './modules/recruitment/models.js';

try {
  const config = readConfig();
  await connectDatabase(config.mongoUri);
  await Promise.all([User, Game, PlayerProfile, PlayerGame, ...recruitmentModels].map(model => model.init()));
  const app = createApp(config);
  const server = app.listen(config.port, '127.0.0.1', () => console.log(`RosterLink API: http://127.0.0.1:${config.port}`));
  const stop = () => server.close(async () => { await app.locals.sessionStore.close(); await mongoose.disconnect(); process.exit(0); });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error(`Unable to start RosterLink (${error.name}). Check .env and start MongoDB.`, error.name === 'Error' ? error.message : '');
  process.exitCode = 1;
  await mongoose.disconnect();
}
