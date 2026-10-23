import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';

const contents = await readFile('.env', 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
const existing = dotenv.parse(contents);
const defaults = { MONGODB_URI: 'mongodb://127.0.0.1:27017/rosterlink', SESSION_SECRET: randomBytes(48).toString('hex'), PORT: '3001', APP_ORIGIN: 'http://127.0.0.1:5173', UPLOAD_DIR: '.local-data/uploads', NODE_ENV: 'development', TRUST_PROXY: '0' };
const missing = Object.entries(defaults).filter(([key]) => existing[key] === undefined);
if (missing.length) await appendFile('.env', `\n${missing.map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
console.log(`Local environment ready. Added ${missing.length} missing setting(s); preserved all existing values.`);
