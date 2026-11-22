import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { connectDatabase } from './db.js';
import { syncLiquipediaGames } from './modules/games/liquipedia-catalog.js';
import { Game } from './modules/games/model.js';

try {
  await connectDatabase(readConfig().mongoUri);
  await Game.init();
  const { count } = await syncLiquipediaGames();
  console.log(`${count} games available.`);
} finally { await mongoose.disconnect(); }
