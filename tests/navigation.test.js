import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, safeReturnTo } from '../shared/navigation.js';

test('SF-01/02: authentication return paths stay within recognized local routes', () => {
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/login', '/register?next=/login', '/forgot-password', '/unknown', null, '/openings\n']) assert.equal(safeReturnTo(path), '/workspace');
  assert.equal(safeReturnTo('/profile/edit'), '/profile/edit');
  assert.equal(safeReturnTo('/openings?region=Middle+East'), '/openings?region=Middle+East');
});
test('SF-04/14/15/21: known destinations and nested management routes resolve explicitly', () => {
  const org = 'a'.repeat(24), team = 'b'.repeat(24);
  assert.equal(resolveRoute('/profile/games/').tab, 'games');
  assert.equal(resolveRoute('/organizations/new').creating, true);
  assert.equal(resolveRoute(`/manage/organizations/${org}/teams/${team}/edit`).teamId, team);
  assert.equal(resolveRoute(`/manage/organizations/${org}/teams/${team}/edit`).editTeam, true);
  assert.equal(resolveRoute('/profile/unknown').page, 'not-found');
  assert.equal(resolveRoute(`/manage/organizations/${org}/teams/bad`).page, 'not-found');
});
test('SF-18: a route never creates membership or a permission flag', () => {
  const org = 'a'.repeat(24);
  for (const path of ['/organizations', '/organizations/new', `/manage/organizations/${org}`, `/manage/organizations/${org}/teams/new`]) {
    assert.equal(resolveRoute(path).private, true);
    assert.equal(resolveRoute(path).canManage, undefined);
  }
  for (const path of ['/openings', `/openings/${org}`, `/organizations/${org}`, `/teams/${org}`]) assert.equal(Boolean(resolveRoute(path).private), false);
});
