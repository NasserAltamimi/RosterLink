import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { requireUser } from '../auth/routes.js';
import { PlayerProfile, PlayerGame } from './model.js';
import { Game } from '../games/model.js';
import { sharedDetailsInput, experienceInput } from '../games/player-form.js';
import { sharedDetails } from '../../../shared/game-form.js';
import { normalizeLanguages, profileLanguageLimits } from '../../../shared/languages.js';
import { HttpError, parse } from '../../lib/errors.js';

const profileInput = z.object({
  displayName: z.string().trim().min(2, 'Enter at least 2 characters.').max(50),
  bio: z.string().trim().max(1000),
  region: z.string().trim().min(1, 'Enter your region.').max(80),
  // Trimmed, Arabic/English canonicalized and de-duplicated case-insensitively (SF-04).
  languages: z.array(z.string().trim().min(1).max(profileLanguageLimits.maxItemLength, `Keep each language to ${profileLanguageLimits.maxItemLength} characters or fewer.`)).min(1, 'Choose at least one language.').max(profileLanguageLimits.maxItems, `Choose up to ${profileLanguageLimits.maxItems} languages.`).transform(normalizeLanguages),
}).strict();
const gameInput = z.object({ gameId: z.string().regex(/^[a-f0-9]{24}$/i), details: sharedDetailsInput, experience: experienceInput.optional() }).strict();
const gameUpdate = gameInput.omit({ gameId: true });
const validId = id => { if (!mongoose.isObjectIdOrHexString(id)) throw new HttpError(404, 'Profile or game section not found.'); };

function profileDto(profile) {
  const imageUrl = kind => `/api/profiles/${profile.id}/images/${kind}?v=${profile.updatedAt.getTime()}`;
  return {
    id: profile.id, displayName: profile.displayName, bio: profile.bio, region: profile.region,
    languages: profile.languages, updatedAt: profile.updatedAt,
    profileImageUrl: profile.profileImage ? imageUrl('profile') : null,
    headerImageUrl: profile.headerImage ? imageUrl('header') : null,
  };
}
const sectionDto = section => ({ id: section.id, gameId: String(section.game), details: Object.fromEntries(section.details), sharedDetails: sharedDetails(Object.fromEntries(section.details)), legacyDetails: section.legacyDetails ? Object.fromEntries(section.legacyDetails) : section.schemaVersion < 2 ? Object.fromEntries(section.details) : {}, experience: section.experience || [], schemaVersion: section.schemaVersion, source: section.source, updatedAt: section.updatedAt });
async function payload(profile) {
  return { profile: profileDto(profile), sections: (await PlayerGame.find({ profile: profile._id })).map(sectionDto) };
}

export function profileRoutes(storage) {
  const router = Router();
  router.use(requireUser);
  router.get('/me', async (req, res) => {
    const profile = await PlayerProfile.findOne({ owner: req.user._id });
    res.json(profile ? await payload(profile) : { profile: null, sections: [] });
  });
  router.post('/', async (req, res) => {
    const values = parse(profileInput, req.body);
    const profile = await PlayerProfile.create({ ...values, owner: req.user._id });
    res.status(201).json(await payload(profile));
  });
  router.param('profileId', async (req, res, next, id) => {
    validId(id);
    const profile = await PlayerProfile.findOne({ _id: id, owner: req.user._id });
    if (!profile) throw new HttpError(404, 'Profile not found.');
    req.profile = profile;
    next();
  });
  router.get('/:profileId', async (req, res) => res.json(await payload(req.profile)));
  router.put('/:profileId', async (req, res) => {
    const values = parse(profileInput, req.body);
    const profile = await PlayerProfile.findOneAndUpdate({ _id: req.profile._id, owner: req.user._id }, { $set: values }, { returnDocument: 'after', runValidators: true });
    if (!profile) throw new HttpError(404, 'Profile not found.');
    res.json(await payload(profile));
  });

  async function detailsFor(gameId, details, experience) {
    validId(gameId);
    const game = await Game.findOne({ _id: gameId, enabled: true });
    if (!game) throw new HttpError(400, 'Choose a supported game.');
    if (experience?.some(entry => (entry.tournament && entry.tournament.gameId !== game.providerId) || (entry.competition && entry.competition.gameId !== game.providerId))) throw new HttpError(400, 'Select a competition for this game, or enter it manually.');
    return { details, schemaVersion: 2, ...(experience !== undefined ? { experience } : {}) };
  }
  router.post('/:profileId/games', async (req, res) => {
    const { gameId, details, experience } = parse(gameInput, req.body);
    const values = await detailsFor(gameId, details, experience);
    const section = await PlayerGame.create({ profile: req.profile._id, game: gameId, ...values });
    res.status(201).json({ section: sectionDto(section) });
  });
  router.put('/:profileId/games/:gameId', async (req, res) => {
    const { details, experience } = parse(gameUpdate, req.body);
    const values = await detailsFor(req.params.gameId, details, experience);
    const existing = await PlayerGame.findOne({ profile: req.profile._id, game: req.params.gameId });
    if (existing?.schemaVersion < 2) values.legacyDetails = Object.fromEntries(existing.details);
    const section = await PlayerGame.findOneAndUpdate({ profile: req.profile._id, game: req.params.gameId }, { $set: values }, { returnDocument: 'after', runValidators: true });
    if (!section) throw new HttpError(404, 'Game section not found.');
    res.json({ section: sectionDto(section) });
  });
  router.delete('/:profileId/games/:gameId', async (req, res) => {
    validId(req.params.gameId);
    const result = await PlayerGame.deleteOne({ profile: req.profile._id, game: req.params.gameId });
    if (!result.deletedCount) throw new HttpError(404, 'Game section not found.');
    res.status(204).end();
  });

  router.param('kind', (req, res, next, kind) => {
    if (!['profile', 'header'].includes(kind)) throw new HttpError(404, 'Image not found.');
    req.imageField = kind === 'profile' ? 'profileImage' : 'headerImage';
    next();
  });
  router.get('/:profileId/images/:kind', async (req, res) => {
    const key = req.profile[req.imageField];
    if (!key) throw new HttpError(404, 'Image not found.');
    let path;
    try { path = await storage.path(key); } catch { throw new HttpError(404, 'Image not found. Please upload it again.'); }
    res.type('webp').sendFile(path, { dotfiles: 'allow' });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
  router.post('/:profileId/images/:kind', upload.single('image'), async (req, res) => {
    const key = await storage.save(req.file, req.params.kind);
    let previous;
    try {
      previous = await PlayerProfile.findOneAndUpdate({ _id: req.profile._id, owner: req.user._id }, { $set: { [req.imageField]: key } }, { runValidators: true });
      if (!previous) throw new HttpError(404, 'Profile not found.');
    } catch (error) { await storage.remove(key); throw error; }
    await storage.remove(previous[req.imageField]);
    const profile = await PlayerProfile.findOne({ _id: req.profile._id, owner: req.user._id });
    res.json({ profile: profileDto(profile) });
  });
  router.delete('/:profileId/images/:kind', async (req, res) => {
    const previous = await PlayerProfile.findOneAndUpdate({ _id: req.profile._id, owner: req.user._id }, { $unset: { [req.imageField]: 1 } });
    if (!previous) throw new HttpError(404, 'Profile not found.');
    await storage.remove(previous[req.imageField]);
    const profile = await PlayerProfile.findOne({ _id: req.profile._id, owner: req.user._id });
    res.json({ profile: profileDto(profile) });
  });
  return router;
}
