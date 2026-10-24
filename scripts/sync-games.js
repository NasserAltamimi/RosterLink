import mongoose from 'mongoose';
import { readConfig } from '../server/config.js';
import { connectDatabase } from '../server/db.js';
import { seedGames } from '../server/modules/games/catalog.js';
import { syncPandaScoreGames } from '../server/modules/games/pandascore.js';

try {
  await connectDatabase(readConfig().mongoUri);
  await seedGames();
  const result = await syncPandaScoreGames({ token: process.env.PANDASCORE_API_TOKEN });
  console.log(`Synced ${result.count} PandaScore games; ${result.withImages} include API images.`);
} catch (error) {
  console.error(`Game sync failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
