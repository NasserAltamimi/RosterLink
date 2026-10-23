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
async function createProfile(page) {
  await page.getByLabel('Gaming / display name').fill('Riyadh Pilot');
  await page.getByLabel('Region / country').fill('Saudi Arabia');
  await page.getByLabel(/^Languages/).fill('Arabic, English');
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
  await page.getByLabel('Competitive playlist', { exact: false }).selectOption('2v2 Doubles');
  await page.getByLabel(/^Rank/).selectOption('Champion II');
  await page.getByLabel('Division').selectOption('III');
  await page.getByLabel('Season / rank context').fill('Season 20');
  await page.getByLabel('Play preference').selectOption('Flexible / rotation-based');
  await page.getByLabel('Server region').selectOption('Middle East');
  await page.getByLabel('Communication language').fill('Arabic / English');
  await page.getByLabel('Availability', { exact: false }).fill('Sun–Thu 20:00–23:00 Asia/Riyadh');
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save game section' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Player workspace' }).getByRole('button', { name: 'Edit profile', exact: true }).click();
  const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#4b805a' } }).png().toBuffer();
  for (const kind of ['profile', 'header']) {
    await page.getByLabel(`Upload ${kind} image`, { exact: true }).setInputFiles({ name: `${kind}.png`, mimeType: 'image/png', buffer: png });
    await expect(page.getByText(`${kind === 'profile' ? 'Profile' : 'Header'} image saved.`, { exact: true })).toBeVisible();
  }
  await page.getByLabel('About you').fill('Updated profile — لاعب تنافسي.');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible();
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
