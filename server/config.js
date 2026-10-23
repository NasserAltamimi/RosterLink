import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ quiet: true });

export function readConfig() {
  const production = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.startsWith('replace-')) throw new Error('Set SESSION_SECRET to a random value of at least 32 characters. Run npm run setup:local for local development.');
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('Set MONGODB_URI in .env.');
  const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';
  if (production && !origin.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS.');
  return { mongoUri, sessionSecret, origin, production, pandaScoreToken: process.env.PANDASCORE_API_TOKEN, trustProxy: process.env.TRUST_PROXY === '1', uploadDir: resolve(process.env.UPLOAD_DIR || '.local-data/uploads'), port: Number(process.env.PORT || 3001) };
}
