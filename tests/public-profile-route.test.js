import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicProfileRoute } from '../shared/public-profile-route.js';

test('SF-13: public URLs reserve invalid IDs while preserving account and recovery routes', () => {
  const id = '0123456789abcdef01234567';
  assert.deepEqual(publicProfileRoute(`/p/${id}`), { profileId: id });
  assert.deepEqual(publicProfileRoute(`/p/${id.toUpperCase()}/`), { profileId: id.toUpperCase() });
  for (const path of ['/p','/p/','/p/not-an-id',`/p/${id}/extra`,'/p/%2Fsecret']) assert.deepEqual(publicProfileRoute(path), { profileId: null });
  for (const path of ['/','/login','/forgot-password','/reset-password','/profiles','/player']) assert.equal(publicProfileRoute(path), null);
});
