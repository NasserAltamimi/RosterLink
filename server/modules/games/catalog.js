import { Game } from './model.js';
import { gameFields } from '../../../shared/game-form.js';

const ranks = ['Unranked', ...['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion', 'Grand Champion']
  .flatMap(tier => ['I', 'II', 'III'].map(level => `${tier} ${level}`)), 'Supersonic Legend'];

const select = (key, label, options, extra = {}) => ({ key, label, type: 'select', required: true, options, ...extra });

export const rocketLeague = {
  slug: 'rocket-league',
  name: 'Rocket League',
  providerId: 22,
  enabled: true,
  schemaVersion: 1,
  description: 'Competitive Soccar pilot. Record one primary playlist and its self-reported rank per game section.',
  fields: [
    select('playlist', 'Competitive playlist', ['1v1 Duel', '2v2 Doubles', '3v3 Standard']),
    select('rank', 'Rank', ranks, { help: 'Self-reported. RosterLink does not verify or fetch your live rank.' }),
    select('division', 'Division', ['I', 'II', 'III', 'IV'], {
      notApplicableWhen: { field: 'rank', values: ['Unranked', 'Supersonic Legend'] },
    }),
    { key: 'season', label: 'Season / rank context', type: 'text', required: true, maxLength: 40, help: 'Enter the season shown in your game, e.g. Season 20.' },
    select('preference', 'Play preference', ['Flexible / rotation-based', 'Offensive preference', 'Defensive preference'], {
      help: 'A personal preference, not an official fixed Rocket League position.',
    }),
    select('server', 'Server region', ['Middle East', 'Europe', 'US-East', 'US-Central', 'US-West', 'Asia-SE Mainland', 'Asia-SE Maritime', 'Asia-East', 'Oceania', 'South America', 'South Africa', 'India']),
    { key: 'language', label: 'Communication language', type: 'text', required: true, maxLength: 60 },
    { key: 'availability', label: 'Availability', type: 'text', required: true, maxLength: 160, help: 'Include days, times, and timezone, e.g. Sun–Thu, 8–11 PM, Asia/Riyadh.' },
  ],
  sources: [
    { title: 'Epic Games: Competitive ranks', url: 'https://www.epicgames.com/help/c-37599050/a20928700?lang=en-US' },
    { title: 'Epic Games: Server regions', url: 'https://www.epicgames.com/help/c-37599050/c-32343914/a15871185?lang=en-US' },
  ],
};

export async function seedGames() {
  // An explicit seed command updates configuration. Never overwrite it on each request.
  await Game.updateOne({ slug: rocketLeague.slug }, { $set: { ...rocketLeague, fields: gameFields, schemaVersion: 2, description: 'Add your platform, play region, communication languages, and availability.' } }, { upsert: true, runValidators: true });
}

export function validateGameDetails(game, input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: { details: 'Enter the game details.' } };
  const known = new Set(game.fields.map(field => field.key));
  for (const key of Object.keys(input)) if (!known.has(key)) errors[key] = 'This field is not supported.';
  const details = {};
  for (const field of game.fields) {
    const value = input[field.key];
    const inactive = field.notApplicableWhen?.field && field.notApplicableWhen.values.includes(input[field.notApplicableWhen.field]);
    if (inactive) {
      if (value !== undefined && value !== '') errors[field.key] = 'This field does not apply to the selected rank.';
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      continue;
    }
    const normalized = value.trim();
    if (field.type === 'select' && !field.options.includes(normalized)) errors[field.key] = `Choose a valid ${field.label.toLowerCase()}.`;
    if (normalized.length > (field.maxLength || 160)) errors[field.key] = `${field.label} is too long.`;
    details[field.key] = normalized;
  }
  return { errors, details };
}
