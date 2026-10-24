import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const password = 'Browser demo passphrase 2026!';
async function register(page) {
  await page.goto('/');
  await page.getByLabel('Email address').fill(`browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByRole('heading', { name: 'Your journey starts here.' })).toBeVisible();
}
// SF-04 / SF-06: the shared language picker (Arabic / English / Other).
async function chooseLanguages(scope, { arabic = false, english = false, other = '' } = {}) {
  await scope.getByLabel('Arabic', { exact: true }).setChecked(arabic);
  await scope.getByLabel('English', { exact: true }).setChecked(english);
  await scope.getByLabel('Other', { exact: true }).setChecked(Boolean(other));
  if (other) await scope.getByLabel('Other language(s)').fill(other);
}
const profileLanguages = page => page.getByRole('group', { name: 'Languages', exact: true });
const gameLanguages = page => page.getByRole('group', { name: 'Communication language(s)', exact: true });
const toast = (page, text) => page.locator('.toast-region').getByText(text, { exact: true });
async function createProfile(page) {
  await page.getByLabel('Gaming / display name').fill('Riyadh Pilot');
  await page.getByLabel('Region / country').fill('Saudi Arabia');
  await chooseLanguages(profileLanguages(page), { arabic: true, english: true });
  await page.getByLabel('About you').fill('لاعب تنافسي — ready to find my next team.');
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Riyadh Pilot', exact: true })).toBeVisible();
}

test('SF-01–07: real player journey with profile, game, both images, reload and later login', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await register(page);
  const email = (await page.request.get('/api/auth/session')).json().then(body => body.user.email);
  await createProfile(page);
  await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  await page.getByLabel('Platform', { exact: false }).selectOption('PC');
  await page.getByLabel(/^Rank/).fill('Champion II');
  await page.getByRole('combobox', { name: 'Play region' }).selectOption('Middle East');
  await chooseLanguages(gameLanguages(page), { arabic: true, english: true });
  await page.getByLabel('Availability', { exact: false }).fill('Sun–Thu 20:00–23:00 Asia/Riyadh');
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save game section' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Player workspace' }).getByRole('button', { name: 'Edit profile', exact: true }).click();
  const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#4b805a' } }).png().toBuffer();
  for (const kind of ['profile', 'header']) {
    await page.getByLabel(`Upload ${kind} image`, { exact: true }).setInputFiles({ name: `${kind}.png`, mimeType: 'image/png', buffer: png });
    await expect(toast(page, `${kind === 'profile' ? 'Profile' : 'Header'} image saved.`)).toBeVisible();
  }
  await page.getByLabel('About you').fill('Updated profile — لاعب تنافسي.');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(toast(page, 'Profile saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Updated profile — لاعب تنافسي.', { exact: true })).toBeVisible();
  await expect(page.getByText('Champion II', { exact: true })).toBeVisible();
  for (const alt of ['Your player avatar', 'Your player header']) {
    const image = page.getByAltText(alt);
    await expect(image).toBeVisible();
    expect(await image.evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('player-overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make your first move.' })).toBeVisible();
  expect((await page.request.get('/api/profiles/me')).status()).toBe(401);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Email address').fill(await email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  await expect(page.getByText('Updated profile — لاعب تنافسي.', { exact: true })).toBeVisible();
  await expect(page.getByText('Champion II', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('shared game forms: optional rank, tournament metadata/manual entries, pagination, errors and multiple game persistence', async ({ page }, testInfo) => {
  await register(page); await createProfile(page);
  const searches = [];
  page.on('request', request => { if (request.url().includes('/tournaments?')) searches.push(request.url()); });
  await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  await expect(page.getByLabel('Platform', { exact: false })).toBeVisible();
  expect(searches).toHaveLength(0);
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  expect(await page.getByLabel('Platform', { exact: false }).evaluate(input => input.validity.valid)).toBe(false);
  await page.getByLabel('Platform', { exact: false }).selectOption('PC');
  await expect(page.getByRole('combobox', { name: 'Play region' })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Play region' }).locator('option')).toHaveCount(10);
  await page.getByRole('combobox', { name: 'Play region' }).selectOption('Other');
  await page.getByLabel('Custom play region', { exact: false }).fill('US-East / custom region');
  await chooseLanguages(gameLanguages(page), { arabic: true, english: true });
  await page.getByLabel('Availability', { exact: false }).fill('Fri 20:00 Asia/Riyadh; tryouts Sat');
  const search = page.getByLabel('Search Rocket League competitions');
  await search.fill('EW'); await search.fill('EWC');
  await expect(page.getByRole('button', { name: 'Select Esports World Cup 2026' })).toHaveCount(1);
  expect(searches).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select Esports World Cup 2026' }).click();
  const entry1 = page.getByRole('group', { name: 'Tournament entry 1', exact: true });
  await expect(entry1.getByLabel('Competition name', { exact: false })).toHaveValue('Esports World Cup');
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  expect(await entry1.getByLabel('Placement / elimination stage', { exact: false }).evaluate(input => input.validity.valid)).toBe(false);
  await expect(entry1.getByLabel('Placement / elimination stage', { exact: false }).locator('option[value="exact:1"]')).toHaveCount(1);
  await entry1.getByLabel('Placement / elimination stage', { exact: false }).selectOption('exact:1');
  await page.getByRole('button', { name: 'Add tournament manually' }).click();
  const entry2 = page.getByRole('group', { name: 'Tournament entry 2', exact: true });
  await entry2.getByLabel('Competition name', { exact: false }).fill('KSU LAN');
  await entry2.getByLabel('Edition / year', { exact: false }).fill('2025');
  await entry2.getByLabel('Manual result (self-reported)', { exact: false }).fill('Top 8');
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save game section', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Competitive experience · Self-reported' })).toBeVisible();
  await expect(page.getByText('Metadata: PandaScore', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Play region' })).toHaveValue('Other');
  await expect(page.getByLabel('Custom play region', { exact: false })).toHaveValue('US-East / custom region');
  await expect(entry1.getByLabel('Placement / elimination stage', { exact: false })).toHaveValue('exact:1');
  await expect(entry1.getByLabel('Placement / elimination stage', { exact: false }).locator('option[value="elimination:quarterfinal"]')).toHaveCount(1);
  await entry1.getByLabel('Placement / elimination stage', { exact: false }).selectOption('elimination:quarterfinal');
  await page.getByRole('button', { name: 'Delete tournament entry 2' }).click();
  await page.getByRole('button', { name: 'Save game section', exact: true }).click();
  await expect(toast(page, 'Game profile saved.')).toBeVisible();
  await page.getByRole('radio', { name: 'Valorant', exact: true }).check();
  await expect(page.getByLabel(/^Rank/)).toHaveValue('');
  const otherSearch = page.getByLabel('Search Valorant competitions');
  await otherSearch.fill('empty');
  await expect(page.getByText('No matches in the provider pages searched.', { exact: false })).toBeVisible();
  await otherSearch.fill('outage');
  await expect(page.getByRole('alert')).toContainText('manually');
  await page.getByRole('button', { name: 'Add tournament manually' }).click();
  await entry1.getByLabel('Competition name', { exact: false }).fill('Community Cup');
  await entry1.getByLabel('Edition / year', { exact: false }).fill('2026');
  await entry1.getByLabel('Manual result (self-reported)', { exact: false }).fill('Winner');
  await page.getByLabel('Platform', { exact: false }).selectOption('PlayStation');
  await page.getByRole('combobox', { name: 'Play region' }).selectOption('Middle East');
  await chooseLanguages(gameLanguages(page), { english: true });
  await page.getByLabel('Availability', { exact: false }).fill('Sat 18:00 Asia/Riyadh');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('shared-game-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save game section', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete tournament entry 1' }).click();
  await page.getByRole('button', { name: 'Save game section', exact: true }).click();
  await expect(toast(page, 'Game profile saved.')).toBeVisible();
  await page.reload();
  const restored = await (await page.request.get('/api/profiles/me')).json();
  const catalog = await (await page.request.get('/api/games')).json();
  const rocket = restored.sections.find(section => section.gameId === catalog.games.find(game => game.providerId === 22)._id);
  const valorant = restored.sections.find(section => section.gameId === catalog.games.find(game => game.providerId === 26)._id);
  expect(restored.sections).toHaveLength(2);
  expect(rocket.experience[0].placement).toBe('Quarterfinal exit');
  expect(rocket.experience[0].result).toEqual({ kind: 'elimination', value: 'quarterfinal' });
  expect(rocket.experience[0].competition.stageIds).toHaveLength(3);
  expect(rocket.details.server).toBe('US-East / custom region');
  expect(rocket.experience).toHaveLength(1);
  expect(valorant.experience).toHaveLength(0);
  expect(valorant.details.rank).toBe('');
  await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  await page.getByRole('radio', { name: /^Valorant/ }).check();
  await expect(page.getByLabel('Platform', { exact: false })).toHaveValue('PlayStation');
  await expect(page.getByLabel('Availability', { exact: false })).toHaveValue('Sat 18:00 Asia/Riyadh');
});

test('Mobile Legends EWC/MSC aliases, grouped editions, bounded pagination and manual result fallback', async ({ page }, testInfo) => {
  await register(page); await createProfile(page);
  await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  await page.getByRole('radio', { name: 'Mobile Legends: Bang Bang' }).check();
  const search = page.getByLabel('Search Mobile Legends: Bang Bang competitions');
  for (const query of ['EWC', 'Esports World Cup', 'MSC', 'Mid Season Cup']) {
    await search.fill(query);
    await expect(page.getByRole('button', { name: 'Select Mid Season Cup 2026' })).toHaveCount(1);
    await expect(page.getByText('Search is incomplete or bounded to these pages.', { exact: false })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('button', { name: 'Select Mid Season Cup 2024' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await page.getByRole('button', { name: 'Select Mid Season Cup 2026' }).click();
  const entry = page.getByRole('group', { name: 'Tournament entry 1', exact: true });
  const result = entry.getByLabel('Placement / elimination stage', { exact: false });
  await expect(result.locator('option[value="top:8"]')).toHaveCount(1);
  await expect(result.locator('option[value="exact:8"]')).toHaveCount(0);
  await expect(result.locator('option[value="top:6"]')).toHaveCount(0);
  await result.selectOption('range:5-8');
  await page.getByLabel('Platform', { exact: false }).selectOption('Android');
  await page.getByRole('combobox', { name: 'Play region' }).selectOption('Asia');
  await chooseLanguages(gameLanguages(page), { english: true });
  await page.getByLabel('Availability', { exact: false }).fill('Fri 20:00 Asia/Riyadh');
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save game section', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  await expect(result).toHaveValue('range:5-8');
  await result.selectOption('manual');
  await entry.getByLabel('Manual result (self-reported)', { exact: false }).fill('Top 6 — my own claim');
  await page.getByRole('button', { name: 'Save game section', exact: true }).click();
  await expect(toast(page, 'Game profile saved.')).toBeVisible();
  const data = await (await page.request.get('/api/profiles/me')).json();
  expect(data.sections[0].experience[0].result).toEqual({ kind: 'manual', value: 'Top 6 — my own claim' });
  expect(data.sections[0].experience[0].competition.stageIds).toHaveLength(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('competition-edition-form.png'), fullPage: true });
  // A saved legacy stage reference and custom region must not disappear on reopening/saving.
  const catalog = await (await page.request.get('/api/games')).json();
  const rocket = catalog.games.find(game => game.providerId === 22);
  const session = await (await page.request.get('/api/auth/session')).json();
  await page.request.post(`/api/profiles/${data.profile.id}/games`, { headers: { 'X-CSRF-Token': session.csrfToken }, data: { gameId: rocket._id, details: { platform: 'PC', server: 'Legacy custom server', language: 'English', availability: 'Fridays' }, experience: [{ name: 'Old EWC entry', edition: '2025', placement: 'Quarterfinalist', stage: 'Playoffs', tournament: { provider: 'pandascore', id: 17141, gameId: 22 } }] } });
  await page.reload(); await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  await page.getByRole('radio', { name: /^Rocket League/ }).check();
  await expect(page.getByLabel('Custom play region', { exact: false })).toHaveValue('Legacy custom server');
  await expect(entry.getByLabel('Manual result (self-reported)', { exact: false })).toHaveValue('Quarterfinalist');
  await expect(entry.getByLabel('Stage / context (optional)')).toHaveValue('Playoffs');
  await page.getByRole('button', { name: 'Save game section', exact: true }).click();
  await expect(toast(page, 'Game profile saved.')).toBeVisible();
  const restored = await (await page.request.get('/api/profiles/me')).json();
  const legacy = restored.sections.find(section => section.gameId === rocket._id);
  expect(legacy.experience[0].tournament.id).toBe(17141);
  expect(legacy.experience[0].placement).toBe('Quarterfinalist');
});

test('TF-02: startup connection failure is actionable and retry recovers', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Cannot connect');
  await page.unroute('**/api/auth/session');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Make your first move.' })).toBeVisible();
});

test('SF-01 / SF-02: browser validation and invalid-login feedback', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill('invalid');
  await page.getByLabel(/^Password/).fill('short');
  await page.getByRole('button', { name: 'Create your account' }).click();
  expect(await page.getByLabel('Email address').evaluate(input => input.validity.valid)).toBeFalsy();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Email address').fill('missing@example.com');
  await page.getByLabel(/^Password/).fill('wrong-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
});

test('SF-04 / SF-07: failed profile save preserves edits and invalid image feedback is useful', async ({ page }) => {
  await register(page); await createProfile(page);
  await page.getByRole('navigation', { name: 'Player workspace' }).getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('About you').fill('Unsaved but preserved');
  await page.route('**/api/profiles/*', route => route.request().method() === 'PUT' ? route.abort() : route.continue());
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot connect');
  await expect(page.getByLabel('About you')).toHaveValue('Unsaved but preserved');
  await page.getByLabel('Upload profile image', { exact: true }).setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a JPEG' })).toBeVisible();
});

test('SF-04 / SF-06 / SF-13: language pickers validate, restore independently and display publicly', async ({ page }) => {
  await register(page);
  await page.getByLabel('Gaming / display name').fill('Language Pilot');
  await page.getByLabel('Region / country').fill('Saudi Arabia');
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await expect(profileLanguages(page).getByText('Choose at least one language.')).toBeVisible();
  await expect(toast(page, 'Profile created.')).toHaveCount(0);
  await profileLanguages(page).getByLabel('Other', { exact: true }).check();
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  expect(await profileLanguages(page).getByLabel('Other language(s)').evaluate(input => input.validity.valid)).toBe(false);
  await chooseLanguages(profileLanguages(page), { arabic: true, other: ' French, urdu, French ' });
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await expect(toast(page, 'Profile created.')).toBeVisible();
  await expect(page.getByText('Saudi Arabia · Arabic / French / urdu', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Game profiles', exact: true }).click();
  await page.getByLabel('Platform', { exact: false }).selectOption('PC');
  await page.getByRole('combobox', { name: 'Play region' }).selectOption('Middle East');
  await page.getByLabel('Availability', { exact: false }).fill('Fri 20:00 Asia/Riyadh');
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(gameLanguages(page).getByText('Choose at least one language.')).toBeVisible();
  await chooseLanguages(gameLanguages(page), { english: true });
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(toast(page, 'Game profile added.')).toBeVisible();
  await page.getByRole('radio', { name: 'Valorant', exact: true }).check();
  await page.getByLabel('Platform', { exact: false }).selectOption('PC');
  await page.getByRole('combobox', { name: 'Play region' }).selectOption('Europe');
  await page.getByLabel('Availability', { exact: false }).fill('Sat 18:00 Asia/Riyadh');
  await chooseLanguages(gameLanguages(page), { arabic: true, english: true, other: 'Tagalog' });
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(toast(page, 'Game profile added.')).toBeVisible();

  await page.reload();
  const data = await (await page.request.get('/api/profiles/me')).json();
  const catalog = await (await page.request.get('/api/games')).json();
  const sectionFor = providerId => data.sections.find(section => section.gameId === catalog.games.find(game => game.providerId === providerId)._id);
  expect(data.profile.languages).toEqual(['Arabic', 'French', 'urdu']);
  expect(sectionFor(22).details.language).toBe('English');
  expect(sectionFor(26).details.language).toBe('Arabic, English, Tagalog');
  await page.getByRole('navigation', { name: 'Player workspace' }).getByRole('button', { name: 'Edit profile', exact: true }).click();
  await expect(profileLanguages(page).getByLabel('Arabic', { exact: true })).toBeChecked();
  await expect(profileLanguages(page).getByLabel('English', { exact: true })).not.toBeChecked();
  await expect(profileLanguages(page).getByLabel('Other language(s)')).toHaveValue('French, urdu');
  await profileLanguages(page).getByLabel('English', { exact: true }).check();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(toast(page, 'Profile saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(toast(page, 'Profile saved.')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Player workspace' }).getByRole('button', { name: 'Game profiles', exact: true }).click();
  await page.getByRole('radio', { name: /^Rocket League/ }).check();
  await expect(gameLanguages(page).getByLabel('English', { exact: true })).toBeChecked();
  await expect(gameLanguages(page).getByLabel('Arabic', { exact: true })).not.toBeChecked();
  await expect(gameLanguages(page).getByLabel('Other', { exact: true })).not.toBeChecked();
  await page.getByRole('radio', { name: /^Valorant/ }).check();
  await expect(gameLanguages(page).getByLabel('Arabic', { exact: true })).toBeChecked();
  await expect(gameLanguages(page).getByLabel('Other language(s)')).toHaveValue('Tagalog');
  // A failed save keeps the inline error and never shows a success toast.
  await page.route('**/api/profiles/*/games/*', route => route.request().method() === 'PUT' ? route.abort() : route.continue());
  await page.getByRole('button', { name: 'Save game section', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot connect');
  await expect(toast(page, 'Game profile saved.')).toHaveCount(0);
  await page.unroute('**/api/profiles/*/games/*');

  const after = await (await page.request.get('/api/profiles/me')).json();
  expect(after.profile.languages).toEqual(['Arabic', 'English', 'French', 'urdu']);
  expect(after.sections.find(section => section.gameId === sectionFor(22).gameId).details.language).toBe('English');
  await page.goto(`/p/${after.profile.id}`);
  await expect(page.getByText('Saudi Arabia · Arabic / English / French / urdu', { exact: true })).toBeVisible();
  await expect(page.getByText('Arabic, English, Tagalog', { exact: true })).toBeVisible();
  await expect(page.getByText('English', { exact: true })).toBeVisible();
});

test('SF-01 / SF-02 / SF-04–07: success toasts appear top-right once, dismiss themselves and fit small screens', async ({ page }) => {
  await register(page);
  await expect(toast(page, 'Account created.')).toBeVisible();
  const box = await page.locator('.toast').first().boundingBox();
  const width = await page.evaluate(() => innerWidth);
  expect(box.y).toBeLessThan(40);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.x + box.width).toBeGreaterThan(width - 40);
  await expect(toast(page, 'Account created.')).toHaveCount(0, { timeout: 8000 });
  await createProfile(page);
  await expect(toast(page, 'Profile created.')).toHaveCount(1);
  await page.getByRole('navigation', { name: 'Player workspace' }).getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(toast(page, 'Profile saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.locator('.toast-region').getByText('Profile saved.')).toHaveCount(1);
  const email = (await (await page.request.get('/api/auth/session')).json()).user.email;
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(toast(page, 'Logged out.')).toBeVisible();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  await expect(toast(page, 'Logged in successfully.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
