import { Game } from './model.js';
import { gameFields } from '../../../shared/game-form.js';

export function providerGame(game) {
  if (!Number.isInteger(game.id) || typeof game.name !== 'string' || !game.name.trim() || typeof game.slug !== 'string' || !game.slug.trim()) {
    throw new Error('PandaScore returned an invalid game.');
  }
  let imageUrl = null;
  try {
    const url = new URL(game.image_url);
    if (url.protocol === 'https:') imageUrl = url.href;
  } catch { /* Missing API images are intentionally left blank. */ }
  return {
    slug: game.slug === 'rl' ? 'rocket-league' : game.slug,
    name: game.name.trim(), providerId: game.id, imageUrl,
  };
}

export const generalGameFields = gameFields;

export async function syncPandaScoreGames({ token, fetchImpl = fetch }) {
  if (!token?.trim()) throw new Error('Set PANDASCORE_API_TOKEN before syncing games.');
  const games = [];
  for (let page = 1; ; page++) {
    const response = await fetchImpl(`https://api.pandascore.co/videogames?per_page=100&page=${page}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token.trim()}` },
      signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`PandaScore catalog request failed (HTTP ${response.status}).`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error('PandaScore returned an invalid catalog.');
    games.push(...body.map(providerGame));
    if (body.length < 100) break;
    if (page >= 100) throw new Error('PandaScore catalog pagination exceeded its limit.');
  }
  if (!games.length) throw new Error('PandaScore returned an empty catalog; existing games were preserved.');
  for (const game of games) {
    const existing = await Game.findOne({ $or: [{ providerId: game.providerId }, { slug: game.slug }] }).select('_id');
    await Game.updateOne(existing ? { _id: existing._id } : { slug: game.slug }, {
      $set: game,
      $setOnInsert: {
        enabled: true, schemaVersion: 2,
        description: 'Add your in-game details and availability. Rank and skill level are self-reported.',
        fields: generalGameFields,
        sources: [{ title: 'PandaScore game catalog', url: 'https://developers.pandascore.co/reference/get_videogames' }],
      },
    }, { upsert: true, runValidators: true });
  }
  return { count: games.length, withImages: games.filter(game => game.imageUrl).length };
}
