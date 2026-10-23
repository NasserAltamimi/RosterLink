import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { resolve } from 'node:path';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/db.js';
import { Game } from '../server/modules/games/model.js';

let mongo, app, server, browser, page, checkpoint = 'mapping';
const browserErrors = [];
try {
  const catalog = await (await fetch('http://127.0.0.1:5173/api/games')).json();
  const games = [22, 34].map(id => {
    const game = catalog.games.find(row => row.providerId === id);
    assert.ok(game, 'The existing local catalog must map both games by provider ID.');
    return game;
  });
  checkpoint = 'isolated-app';
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: resolve('.local-data/mongodb-binaries') }, instance: { dbName: 'isolated_live_competition_check' } });
  const mongoUri = mongo.getUri('isolated_live_competition_check');
  await connectDatabase(mongoUri);
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  await Game.create(games.map(({ name, slug, providerId }) => ({ name, slug, providerId, schemaVersion: 2, enabled: true, fields: [] })));
  app = createApp({ mongoUri, sessionSecret: randomBytes(32).toString('hex'), uploadDir: resolve('.local-data/live-check-unused-images'), origin: 'http://127.0.0.1:5185', pandaScoreToken: process.env.PANDASCORE_API_TOKEN });
  server = app.listen(5185, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage();
  page.on('pageerror', error => browserErrors.push(error.message.slice(0, 200)));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text().slice(0, 200)); });
  page.setDefaultTimeout(10000);
  checkpoint = 'page-open';
  await page.goto('http://127.0.0.1:5185');
  const session = await (await page.request.get('http://127.0.0.1:5185/api/auth/session')).json();
  checkpoint = 'registration';
  const registered = await page.request.post('http://127.0.0.1:5185/api/auth/register', { headers: { 'X-CSRF-Token': session.csrfToken }, data: { email: `isolated-${Date.now()}@example.com`, password: randomBytes(24).toString('hex') } });
  assert.equal(registered.status(), 201);
  await page.reload();
  checkpoint = 'profile-fields';
  await page.getByLabel('Gaming / display name').fill('Isolated live check');
  await page.getByLabel('Region / country').fill('Saudi Arabia');
  await page.getByLabel(/^Languages/).fill('English');
  checkpoint = 'save-profile';
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  checkpoint = 'navigation';
  await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  for (const game of games) {
    checkpoint = `game-${game.providerId}`;
    const direct = [];
    const slug = game.providerId === 34 ? 'mid-season-cup' : 'esports-world-cup';
    for (let number = 1; number <= 2; number++) {
      const response = await fetch(`https://api.pandascore.co/videogames/${game.providerId}/tournaments?search[slug]=${slug}&per_page=20&page=${number}&sort=-begin_at`, { headers: { Authorization: `Bearer ${process.env.PANDASCORE_API_TOKEN}` }, signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 200);
      const rows = await response.json(); direct.push(...rows);
      if (rows.length < 20) break;
    }
    await page.getByRole('radio', { name: game.name, exact: true }).check();
    const apiResult = page.waitForResponse(response => response.url().includes('/tournaments?') && response.status() === 200);
    await page.getByLabel(`Search ${game.name} competitions`).fill('EWC');
    const backend = await (await apiResult).json();
    await page.getByRole('button', { name: new RegExp(`^Select ${game.providerId === 34 ? 'Mid Season Cup' : 'Esports World Cup'} 2026$`) }).waitFor();
    const buttons = page.locator('.tournament-results button[aria-label^="Select "]');
    assert.equal(await buttons.count(), backend.competitions.length);
    const directSeries = new Set(direct.map(row => row.serie.id));
    assert.ok(backend.competitions.every(row => directSeries.has(row.competition.seriesId)));
    assert.equal(new Set(backend.competitions.map(row => row.key)).size, backend.competitions.length);
    const detailsResponse = page.waitForResponse(response => response.url().includes('/competitions/') && response.status() === 200);
    await page.getByRole('button', { name: new RegExp(`^Select ${game.providerId === 34 ? 'Mid Season Cup' : 'Esports World Cup'} 2026$`) }).click();
    const detail = await (await detailsResponse).json();
    await page.getByLabel('Placement / elimination stage', { exact: false }).locator('option[value="elimination:quarterfinal"]').waitFor({ state: 'attached' });
    assert.ok(!detail.resultOptions.some(option => option.kind === 'exact' && option.value === '8'));
    console.log(JSON.stringify({ game: game.name, providerId: game.providerId, directStagesAcrossPages: direct.length, directEditions: directSeries.size, backendEditionsOnPage: backend.competitions.length, uiEditionChoices: await buttons.count(), incomplete: backend.incomplete, selectedStageIds: detail.competition.stageIds, resultOptions: detail.resultOptions }));
  }
  console.log('Live direct-provider/backend/UI comparison passed in an isolated database. Existing user profiles were untouched.');
} catch (error) {
  if (page) await page.screenshot({ path: '.local-data/live-check-failure.png', fullPage: true }).catch(() => {});
  console.error(`Live comparison failed at ${checkpoint} (${error.name}).`); process.exitCode = 1;
  console.error(JSON.stringify({ browserErrors }));
} finally {
  await browser?.close();
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  await app?.locals.sessionStore.close();
  await mongoose.disconnect();
  await mongo?.stop();
}
