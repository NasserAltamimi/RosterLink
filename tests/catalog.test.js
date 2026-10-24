import test from 'node:test';
import assert from 'node:assert/strict';
import { rocketLeague, validateGameDetails } from '../server/modules/games/catalog.js';

export const validDetails = {
  playlist: '2v2 Doubles', rank: 'Champion II', division: 'III', season: 'Season 20',
  preference: 'Flexible / rotation-based', server: 'Middle East', language: 'Arabic / English',
  availability: 'Sun–Thu 20:00–23:00 Asia/Riyadh',
};

test('SF-06: valid Rocket League details are accepted and normalized', () => {
  const result = validateGameDetails(rocketLeague, { ...validDetails, season: ' Season 20 ' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.details.season, 'Season 20');
});
test('SF-06: options must belong to the selected game', () => {
  for (const [key, value] of Object.entries({ rank: 'Radiant', playlist: '5v5', division: 'V', server: 'Moon', preference: 'Goalkeeper' })) {
    assert.ok(validateGameDetails(rocketLeague, { ...validDetails, [key]: value }).errors[key]);
  }
});
test('SF-06: unranked and Supersonic Legend have no division', () => {
  for (const rank of ['Unranked', 'Supersonic Legend']) {
    const { division, ...details } = validDetails;
    assert.deepEqual(validateGameDetails(rocketLeague, { ...details, rank }).errors, {});
    assert.ok(validateGameDetails(rocketLeague, { ...validDetails, rank }).errors.division);
  }
});
test('SF-06: missing, malformed, unknown, and overlong fields are rejected', () => {
  assert.ok(validateGameDetails(rocketLeague, null).errors.details);
  assert.ok(validateGameDetails(rocketLeague, { ...validDetails, language: '' }).errors.language);
  assert.ok(validateGameDetails(rocketLeague, { ...validDetails, language: 12 }).errors.language);
  assert.ok(validateGameDetails(rocketLeague, { ...validDetails, season: 'a'.repeat(41) }).errors.season);
  assert.ok(validateGameDetails(rocketLeague, { ...validDetails, verified: 'yes' }).errors.verified);
});
test('SF-05: configured fields are data-driven for future catalog entries', () => {
  const futureGame = { fields: [{ key: 'position', label: 'Position', type: 'select', required: true, options: ['Support'] }] };
  assert.deepEqual(validateGameDetails(futureGame, { position: 'Support' }).errors, {});
  assert.ok(validateGameDetails(futureGame, validDetails).errors.position);
});
