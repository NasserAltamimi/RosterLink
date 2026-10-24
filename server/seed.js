import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { connectDatabase } from './db.js';
import { seedGames } from './modules/games/catalog.js';
import { Game } from './modules/games/model.js';

try {
  await connectDatabase(readConfig().mongoUri);
  await Game.init();
  await seedGames();
  console.log('Rocket League catalog seeded. No user accounts or mock player records were created.');
} finally { await mongoose.disconnect(); }
