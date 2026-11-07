import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeFilters } from '../shared/opening-filters.js';

const games = [{ _id: 'g1', name: 'Rocket League' }, { _id: 'g2', name: 'Overwatch' }];

test('SF-21: no filters, blank filters and missing values produce no summary', () => {
  for (const value of [undefined, {}, { game: '', role: '  ', region: '', language: '' }]) assert.equal(describeFilters(value, games), '');
});

test('SF-21: applied filters are listed in a fixed order with the game name, not its id', () => {
  assert.equal(describeFilters({ language: 'Arabic', game: 'g2', role: ' DPS ' }, games), 'Game: Overwatch · Role: DPS · Language: Arabic');
  assert.equal(describeFilters({ region: 'Middle East' }, games), 'Region: Middle East');
});

test('SF-21: an unknown game or an empty catalog still describes the filter without failing', () => {
  assert.equal(describeFilters({ game: 'zzz' }, games), 'Game: zzz');
  assert.equal(describeFilters({ game: 'g1' }), 'Game: g1');
});
