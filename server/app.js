import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { authRoutes, csrfProtection, requireUser } from './modules/auth/routes.js';
import { z } from 'zod';
import { profileRoutes } from './modules/profiles/routes.js';
import { publicProfileRoutes } from './modules/profiles/public.js';
import { Game } from './modules/games/model.js';
import { localImageStorage } from './storage/local-images.js';
import { HttpError, handleError, parse } from './lib/errors.js';
import { createTournamentSearch, tournamentRoutes } from './modules/games/tournaments.js';
import { gameFields } from '../shared/game-form.js';
import { rankCatalog } from './modules/games/ranks.js';
import { createLiquipediaTournaments } from './modules/games/liquipedia.js';
import { createResetMailer } from './mail/smtp.js';
import { recruitmentRoutes } from './modules/recruitment/routes.js';
import { applicationRoutes } from './modules/recruitment/applications.js';
import { discoveryRoutes } from './modules/posts/discovery.js';
import { postRoutes } from './modules/posts/routes.js';

export function createApp({ mongoUri, sessionSecret, uploadDir, origin, production = false, trustProxy = false, pandaScoreToken, tournamentSearch, liquipediaApiKey, liquipediaTournaments = createLiquipediaTournaments({ apiKey: liquipediaApiKey }), smtp, resetMailer = createResetMailer(smtp) }) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(helmet({ strictTransportSecurity: production ? undefined : false, contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'data:', 'blob:', 'https:'], mediaSrc: ["'self'", 'blob:'] } } }));
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
  app.use('/api/auth', authRoutes({ secureCookies: production, origin, resetMailer }));
  app.get('/api/games', async (req, res) => res.json({ games: (await Game.find({ enabled: true }).select('-__v').lean()).map(game => ({ ...game, ...rankCatalog(game), fields: gameFields, schemaVersion: 2, description: 'Add your platform, play region, communication languages, and availability.' })) }));
  async function tournamentFeed(gameId) {
    if (!mongoose.isObjectIdOrHexString(gameId)) throw new HttpError(404, 'Game not found.');
    const game = await Game.findOne({ _id: gameId, enabled: true }).select('liquipediaWiki').lean();
    if (!game) throw new HttpError(404, 'Game not found.');
    return liquipediaTournaments(game.liquipediaWiki);
  }
  app.get('/api/tournaments/:gameId', async (req, res) => {
    const result = await tournamentFeed(req.params.gameId);
    res.status(result.status === 'unavailable' ? 503 : 200).json({
      ...result, tournaments: result.tournaments.slice(0, 30),
      ...(result.status === 'unavailable' && { message: 'Liquipedia tournaments are temporarily unavailable.' }),
    });
  });
  app.get('/api/profile-tournaments/:gameId', requireUser, async (req, res) => {
    const { q } = parse(z.strictObject({ q: z.string().trim().min(2).max(100) }), req.query);
    const result = await tournamentFeed(req.params.gameId);
    if (result.status === 'unavailable') throw new HttpError(503, 'Liquipedia search is temporarily unavailable. You can enter a tournament manually.');
    const words = q.toLowerCase().split(/\s+/);
    const matches = result.tournaments.filter(event => {
      const terms = `${event.name} ${event.id.replaceAll('_', ' ')} ${event.startDate || ''}`.toLowerCase();
      return event.url && event.id.length <= 500 && words.every(word => terms.includes(word));
    });
    res.json({ status: result.status, stale: Boolean(result.stale), tournaments: matches.slice(0, 20), hasMore: matches.length > 20 });
  });
  app.use('/api/games', tournamentRoutes(tournamentSearch || createTournamentSearch({ token: pandaScoreToken })));
  const imageStorage = localImageStorage(uploadDir);
  app.use('/api/profiles', profileRoutes(imageStorage, liquipediaTournaments));
  app.use('/api/public/profiles', publicProfileRoutes(imageStorage));
  app.use('/api/applications', applicationRoutes());
  app.use('/api/discovery', discoveryRoutes());
  app.use('/api/posts', postRoutes(uploadDir));
  app.use('/api', recruitmentRoutes(imageStorage));
  app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use(handleError);
  return app;
}
