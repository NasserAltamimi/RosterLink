import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireUser } from '../auth/routes.js';
import { Game } from './model.js';
import { HttpError } from '../../lib/errors.js';
export { createTournamentSearch } from './competition-service.js';

export function tournamentRoutes(search) {
  const router = Router();
  router.use(requireUser);
  router.use(rateLimit({ windowMs: 60000, limit: 30, keyGenerator: req => req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many competition searches. Wait a minute or enter manually.' } }));
  router.param('gameId', async (req, res, next, id) => {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new HttpError(404, 'Game not found.');
    req.game = await Game.findOne({ _id: id, enabled: true }).lean();
    if (!req.game) throw new HttpError(404, 'Game not found.');
    next();
  });
  router.get('/:gameId/tournaments', async (req, res) => res.json(await search(req.game.providerId, req.query.q, Number(req.query.page || 1))));
  router.get('/:gameId/competitions/:seriesId', async (req, res) => {
    if (!search.details) throw new HttpError(503, 'Result suggestions are unavailable. Enter manually.');
    res.json(await search.details(req.game.providerId, Number(req.query.leagueId), Number(req.params.seriesId)));
  });
  return router;
}
