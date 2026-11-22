import mongoose from 'mongoose';
import { readConfig } from '../server/config.js';
import { connectDatabase } from '../server/db.js';
import { Game } from '../server/modules/games/model.js';
import { syncLiquipediaGames } from '../server/modules/games/liquipedia-catalog.js';

try {
  await connectDatabase(readConfig().mongoUri);
  await Game.init();
  const before = await Game.countDocuments({ enabled: true });
  const { count, added } = await syncLiquipediaGames();
  console.log(`Enabled games: ${before} → ${count}.`);
  if (added.length) console.log(`Added: ${added.join(', ')}.`);
} catch (error) {
  console.error(`Game sync failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
