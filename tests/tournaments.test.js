import test from 'node:test';
import assert from 'node:assert/strict';
import { createTournamentSearch } from '../server/modules/games/tournaments.js';
import { groupCompetitions, supportedResults } from '../server/modules/games/competition-data.js';
import { sharedDetailsInput, experienceInput } from '../server/modules/games/player-form.js';
import { fixtures, fixtureFetch, json } from './fixtures/competition-provider.js';

test('shared required fields preserve geographic/custom regions and optional rank', () => {
  const details = { platform: 'PC', server: 'US-East custom', language: 'Arabic, English', availability: 'Fri 20:00 Asia/Riyadh' };
  assert.equal(sharedDetailsInput.parse(details).rank, '');
  assert.equal(sharedDetailsInput.parse(details).server, details.server);
  for (const key of Object.keys(details)) assert.equal(sharedDetailsInput.safeParse({ ...details, [key]: ' ' }).success, false);
  assert.equal(sharedDetailsInput.parse({ ...details, server: 'Not applicable', rank: 'Anything' }).rank, 'Anything');
  assert.deepEqual(experienceInput.parse([]), []);
  const entry = { name: 'EWC', edition: '2026', placement: '1st' };
  for (const key of Object.keys(entry)) assert.equal(experienceInput.safeParse([{ ...entry, [key]: ' ' }]).success, false);
  assert.equal(experienceInput.safeParse(Array(21).fill(entry)).success, false);
  assert.equal(experienceInput.safeParse([{ ...entry, result: { kind: 'verified', value: '1' } }]).success, false);
});

test('real provider fixture: EWC grouping uses game, league and series, never stage names', async () => {
  const search = createTournamentSearch({ token: 'test-only', fetchImpl: fixtureFetch });
  const result = await search(22, 'EWC', 1);
  assert.equal(result.competitions.length, 3);
  const edition = result.competitions.find(row => row.competition.seriesId === 10850);
  assert.equal(edition.name, 'Esports World Cup'); assert.equal(edition.edition, '2026');
  assert.deepEqual(edition.competition.stageIds.sort(), [21623, 21624, 21625]);
  const cloned = structuredClone(fixtures.stages.filter(row => row.videogame.id === 22));
  cloned.push({ ...cloned[0], id: 999, league_id: 1 });
  cloned.push({ ...cloned[0], id: 1000, videogame: { id: 34 } });
  cloned.push({ ...cloned[0], id: 1001, serie: { ...cloned[0].serie, id: null } });
  assert.equal(groupCompetitions(cloned, 22).skipped, 3);
});

test('verified Mobile Legends alias finds MSC editions; pagination is explicitly incomplete', async () => {
  const search = createTournamentSearch({ token: 'test-only', fetchImpl: fixtureFetch });
  for (const query of ['EWC', 'Esports World Cup', 'MSC', 'Mid Season Cup']) {
    const result = await search(34, query, 1);
    assert.ok(result.competitions.some(row => row.competition.seriesId === 10754));
    assert.equal(result.competitions.find(row => row.competition.seriesId === 10754).association, 'MSC at Esports World Cup');
  }
  const result = await search(34, 'EWC', 1);
  assert.equal(result.hasMore, true); assert.equal(result.incomplete, true);
  const next = await search(34, 'EWC', 2);
  assert.ok(next.competitions.some(row => row.edition === '2024'));
  assert.equal(next.hasMore, false);
  assert.equal((await search(22, 'MSC', 1)).competitions.length, 0);
  assert.equal((await search(34, 'EWC 2025', 1)).competitions[0].edition, '2025');
  const unknown = structuredClone(fixtures.stages.find(row => row.videogame.id === 34));
  unknown.serie = { id: 99999, league_id: 5264 }; unknown.serie_id = 99999;
  const aliases = createTournamentSearch({ token: 'test-only', fetchImpl: async url => new URL(url).searchParams.get('search[slug]') === 'mid-season-cup' ? json([unknown]) : json([]) });
  assert.equal((await aliases(34, 'EWC', 1)).competitions.length, 0);
});

test('competition detail verifies parent IDs and preserves every stage ID', async () => {
  const search = createTournamentSearch({ token: 'test-only', fetchImpl: fixtureFetch });
  const detail = await search.details(22, 5284, 10850);
  assert.deepEqual(detail.competition.stageIds.sort(), [21623, 21624, 21625]);
  assert.ok(detail.resultOptions.some(option => option.kind === 'exact' && option.value === '1'));
  assert.ok(detail.resultOptions.some(option => option.kind === 'elimination' && option.value === 'quarterfinal'));
  assert.ok(detail.resultOptions.some(option => option.kind === 'range' && option.value === '5-8'));
  assert.ok(detail.resultOptions.some(option => option.kind === 'top' && option.value === '8'));
  assert.ok(!detail.resultOptions.some(option => option.kind === 'exact' && option.value === '8'));
  assert.ok(!detail.resultOptions.some(option => option.value === '6'));
  await assert.rejects(search.details(34, 5284, 10850), error => error.status === 404);
  await assert.rejects(search.details(22, 5264, 10850), error => error.status === 404);
});

test('group standings never imply overall champion and lower-bracket continuation is not elimination', () => {
  const brackets = structuredClone(fixtures.details.find(row => row.path === '/tournaments/21625/brackets').body);
  const standings = [{ rank: 1 }, { rank: 2 }];
  assert.deepEqual(supportedResults([{ id: 21625, name: 'Group A' }], [{ stageId: 21625, brackets, standings }]), []);
  const semi = brackets.find(row => row.name.startsWith('Semifinal'));
  brackets.push({ id: 999, name: 'Lower bracket final', tournament_id: 21625, previous_matches: [{ match_id: semi.id, type: 'loser' }] });
  const options = supportedResults([{ id: 21625, name: 'Playoffs' }], [{ stageId: 21625, brackets, standings }]);
  assert.ok(!options.some(option => option.kind === 'elimination' && option.value === 'semifinal'));
  assert.ok(!options.some(option => option.kind === 'range'));
});

test('cache keys isolate games/query/page, share concurrent requests, and expire', async () => {
  let calls = 0, time = 100000;
  const search = createTournamentSearch({ token: 'test-only', now: () => time, fetchImpl: async url => { calls++; return fixtureFetch(url); } });
  await Promise.all([search(22, 'EWC', 1), search(22, 'ewc', 1)]); assert.equal(calls, 2);
  await search(34, 'EWC', 1); assert.equal(calls, 5);
  await search(22, 'ewc', 2); assert.equal(calls, 7);
  time += 300001; await search(22, 'ewc', 1); assert.equal(calls, 9);
});

test('empty, partial errors, outages and rate limits have distinct states; failures are retryable', async () => {
  const empty = createTournamentSearch({ token: 'test-only', fetchImpl: async () => json([]) });
  assert.equal((await empty(22, 'empty', 1)).competitions.length, 0);
  const partial = createTournamentSearch({ token: 'test-only', fetchImpl: async url => new URL(url).searchParams.has('search[name]') ? json([], 503) : fixtureFetch(url) });
  const result = await partial(22, 'ewc', 1);
  assert.equal(result.incomplete, true); assert.ok(result.warnings[0].includes('unavailable'));
  const broken = createTournamentSearch({ token: 'test-only', fetchImpl: async () => json({}, 503) });
  await assert.rejects(broken(22, 'ewc', 1), error => error.status === 503);
  let time = 100000;
  const limited = createTournamentSearch({ token: 'test-only', now: () => time, fetchImpl: async () => json([], 429, { 'retry-after': '60' }) });
  await assert.rejects(limited(22, 'ewc', 1), error => error.status === 429);
  time += 61000; await assert.rejects(limited(22, 'ewc', 1), error => error.status === 429);
});

test('inaccessible/incomplete brackets provide no guessed results and keep manual entry possible', async () => {
  for (const status of [403, 429]) {
    const search = createTournamentSearch({ token: 'test-only', fetchImpl: async url => new URL(url).pathname.endsWith('/brackets') ? json([], status) : fixtureFetch(url) });
    const detail = await search.details(22, 5284, 10850);
    assert.equal(detail.resultOptions.length, 0); assert.equal(detail.incomplete, true);
  }
});

test('malformed list responses are not cached and truncated brackets do not imply elimination outcomes', async () => {
  let healthy = false;
  const search = createTournamentSearch({ token: 'test-only', fetchImpl: async url => healthy ? fixtureFetch(url) : json({ unexpected: true }) });
  await assert.rejects(search(22, 'ewc', 1), error => error.status === 503);
  healthy = true;
  assert.equal((await search(22, 'ewc', 1)).competitions.length, 3);
  const truncated = createTournamentSearch({ token: 'test-only', fetchImpl: async url => {
    const result = await fixtureFetch(url);
    if (new URL(url).pathname.endsWith('/brackets')) result.headers.set('x-total', '101');
    return result;
  } });
  const detail = await truncated.details(22, 5284, 10850);
  assert.equal(detail.incomplete, true);
  assert.equal(detail.resultOptions.length, 0);
});

test('bounds, missing mappings and missing credentials stop requests before fetching', async () => {
  let calls = 0;
  const search = createTournamentSearch({ token: 'test-only', fetchImpl: () => { calls++; throw new Error(); } });
  for (const args of [[22, 'a', 1], [22, 'x'.repeat(81), 1], [22, ['bad'], 1], [22, 'okay', 0], [22, 'okay', 21], [22, 'okay', 1.5], [undefined, 'okay', 1]]) await assert.rejects(search(...args));
  await assert.rejects(createTournamentSearch()(22, 'okay', 1), /manually/);
  assert.equal(calls, 0);
});
