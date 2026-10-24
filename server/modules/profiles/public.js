import { Router } from 'express';
import mongoose from 'mongoose';
import { PlayerProfile, PlayerGame } from './model.js';
import { sharedDetails } from '../../../shared/game-form.js';
import { HttpError } from '../../lib/errors.js';

// SF-13: read-only public view of a player profile, reachable without logging in.
// The DTO is an allow-list: no owner, email, storage keys, or legacy (pre-v2) details.
const publicImage = (profile, kind) => `/api/public/profiles/${profile.id}/images/${kind}?v=${profile.updatedAt.getTime()}`;

function publicProfileDto(profile, sections) {
  return {
    profile: {
      id: profile.id, displayName: profile.displayName, bio: profile.bio, region: profile.region, languages: profile.languages,
      profileImageUrl: profile.profileImage ? publicImage(profile, 'profile') : null,
      headerImageUrl: profile.headerImage ? publicImage(profile, 'header') : null,
    },
    sections: sections.map(section => ({
      gameId: String(section.game), details: sharedDetails(Object.fromEntries(section.details)), experience: section.experience || [],
    })),
  };
}

export function publicProfileRoutes(storage) {
  const router = Router();
  router.param('profileId', async (req, res, next, id) => {
    if (!mongoose.isObjectIdOrHexString(id)) throw new HttpError(404, 'Profile not found.');
    const profile = await PlayerProfile.findById(id);
    if (!profile) throw new HttpError(404, 'Profile not found.');
    req.profile = profile;
    next();
  });
  router.get('/:profileId', async (req, res) => {
    res.json(publicProfileDto(req.profile, await PlayerGame.find({ profile: req.profile._id })));
  });
  router.get('/:profileId/images/:kind', async (req, res) => {
    const field = { profile: 'profileImage', header: 'headerImage' }[req.params.kind];
    const key = field && req.profile[field];
    if (!key) throw new HttpError(404, 'Image not found.');
    let path;
    try { path = await storage.path(key); } catch { throw new HttpError(404, 'Image not found.'); }
    res.type('webp').sendFile(path, { dotfiles: 'allow' });
  });
  return router;
}
