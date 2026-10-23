import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { authRoutes, csrfProtection } from './modules/auth/routes.js';
import { profileRoutes } from './modules/profiles/routes.js';
import { Game } from './modules/games/model.js';
import { localImageStorage } from './storage/local-images.js';
import { HttpError, handleError } from './lib/errors.js';

export function createApp({ mongoUri, sessionSecret, uploadDir, origin, production = false, trustProxy = false }) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(helmet({ strictTransportSecurity: production ? undefined : false }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') && req.get('origin') !== origin) {
      throw new HttpError(403, 'This request origin is not allowed.');
    }
    next();
  });
  app.get('/api/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'database_unavailable' });
  });
  const store = MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions', ttl: 60 * 60 * 24 * 7, touchAfter: 3600, writeOperationOptions: { w: 1, j: true } });
  store.on('error', () => console.error('Session storage unavailable.'));
  app.locals.sessionStore = store;
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many requests. Please try again later.' } }));
  app.use('/api', session({
    name: 'rosterlink.sid', secret: sessionSecret, store,
    resave: false, saveUninitialized: false, rolling: false,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' },
  }));
  app.use('/api', csrfProtection);
  app.use('/api/auth', authRoutes({ secureCookies: production }));
  app.get('/api/games', async (req, res) => res.json({ games: await Game.find({ enabled: true }).select('-__v').lean() }));
  app.use('/api/profiles', profileRoutes(localImageStorage(uploadDir)));
  app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use(handleError);
  return app;
}
