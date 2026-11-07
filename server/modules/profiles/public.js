import { Router } from 'express';
import mongoose from 'mongoose';
import { PlayerProfile, PlayerGame } from './model.js';
import { sharedDetails } from '../../../shared/game-form.js';
import { publicFieldOptions, resolvePrivacy } from '../../../shared/profile-privacy.js';
import { HttpError } from '../../lib/errors.js';

// SF-13: read-only public view of a player profile, reachable without logging in.
// The DTO is an allow-list: no owner, email, storage keys, or legacy (pre-v2) details.
// SF-08: fields the player hid are left out of the response entirely, not sent as null.
const publicImage = (profile, kind) => `/api/public/profiles/${profile.id}/images/${kind}?v=${profile.updatedAt.getTime()}`;
const hiddenDetails = shown => publicFieldOptions.filter(option => option.detail && !shown[option.key]).map(option => option.detail);

function publicProfileDto(profile, sections) {
  const { openToOffers, publicFields: shown } = resolvePrivacy(profile);
  const hidden = hiddenDetails(shown);
  return {
    profile: {
      id: profile.id, displayName: profile.displayName, openToOffers,
      ...(shown.bio && { bio: profile.bio }),
      ...(shown.region && { region: profile.region }),
      ...(shown.languages && { languages: profile.languages }),
      ...(shown.profileImage && { profileImageUrl: profile.profileImage ? publicImage(profile, 'profile') : null }),
      ...(shown.headerImage && { headerImageUrl: profile.headerImage ? publicImage(profile, 'header') : null }),
    },
    sections: sections.map(section => {
      const details = sharedDetails(Object.fromEntries(section.details));
      for (const key of hidden) delete details[key];
      return { gameId: String(section.game), details, ...(shown.tournamentExperience && { experience: section.experience || [] }) };
    }),
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
    const key = field && resolvePrivacy(req.profile).publicFields[field] && req.profile[field];
    if (!key) throw new HttpError(404, 'Image not found.');
    let path;
    try { path = await storage.path(key); } catch { throw new HttpError(404, 'Image not found.'); }
    res.type('webp').sendFile(path, { dotfiles: 'allow' });
  });
  return router;
}
