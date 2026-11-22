import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLiquipediaTournaments } from '../server/modules/games/liquipedia.js';

test('Liquipedia tournament requests share cached data and preserve it during an outage', async () => {
  let now = 0, reservations = 0, calls = 0, outage = false;
  const tournamentsFor = createLiquipediaTournaments({
    apiKey: 'test-key', now: () => now,
    reserve: async () => { reservations++; return true; },
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.origin + url.pathname, 'https://api.liquipedia.net/api/v3/tournament');
      assert.equal(options.headers.Authorization, 'Apikey test-key');
      const wiki = url.searchParams.get('wiki');
      if (wiki === 'chess') return { status: 404 };
      if (outage) return { ok: false, status: 503 };
      const result = wiki === 'rocketleague' ? [{ pagename: 'Example/Cup #1', name: 'Example Cup', startdate: '2026-11-20', enddate: '2026-11-21', status: 'postponed' }] : [];
      return { ok: true, json: async () => ({ result }) };
    },
  });
  const [first, second] = await Promise.all([tournamentsFor('rocketleague'), tournamentsFor('rocketleague')]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.tournaments, [{ id: 'Example/Cup #1', name: 'Example Cup', startDate: '2026-11-20', endDate: '2026-11-21', status: 'postponed', url: 'https://liquipedia.net/rocketleague/Example/Cup%20%231' }]);
  assert.deepEqual(await tournamentsFor('rocketleague'), first);
  assert.equal(calls, 1);
  assert.equal(reservations, 1);
  assert.deepEqual(await tournamentsFor('tft'), { provider: 'Liquipedia', status: 'ok', tournaments: [], retrievedAt: new Date(now).toISOString() });
  assert.equal((await tournamentsFor('chess')).status, 'unsupported');
  assert.equal((await tournamentsFor(null)).status, 'unsupported');
  assert.equal(calls, 3);
  now = 3_600_001;
  outage = true;
  assert.deepEqual(await tournamentsFor('rocketleague'), { ...first, stale: true });
  assert.deepEqual(await tournamentsFor('rocketleague'), { ...first, stale: true });
  assert.equal(calls, 4);
  assert.equal((await tournamentsFor('valorant')).status, 'unavailable');
});
