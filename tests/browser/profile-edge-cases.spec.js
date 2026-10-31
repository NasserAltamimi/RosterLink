import { test, expect } from '@playwright/test';
import { edgeAccount, legacyLanguage } from '../fixtures/profile-edge-cases.js';

async function owner(page) {
  const initial = await (await page.request.get('/api/auth/session')).json();
  const response = await page.request.post('/api/auth/login', { headers: { 'X-CSRF-Token': initial.csrfToken }, data: edgeAccount });
  expect(response.status()).toBe(200);
  return (await (await page.request.get('/api/profiles/me')).json());
}

test('SF-06: an existing compact language list allows unrelated edits without losing languages', async ({ page }, testInfo) => {
  const before = await owner(page);
  await page.goto('/profile');
  await page.getByRole('link', { name: 'Game profiles', exact: true }).click();
  const availability = `Updated ${testInfo.project.name} availability`;
  await page.getByLabel('Availability', { exact: false }).fill(availability);
  await page.getByRole('button', { name: 'Save game section', exact: true }).click();
  await expect(page.locator('.toast-region')).toContainText('Game profile saved.', { timeout: 3000 });
  await expect(page.getByRole('button', { name: 'Save game section', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('legacy-language-save.png'), fullPage: true });
  const after = await (await page.request.get('/api/profiles/me')).json();
  expect(after.sections[0].details.language).toBe(legacyLanguage);
  expect(after.sections[0].details.availability).toBe(availability);
  expect(after.profile.languages).toEqual(before.profile.languages);
  await page.reload();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByText(availability, { exact: true })).toBeVisible();
});

test('SF-13: the longest allowed public name wraps inside the card on desktop and mobile', async ({ page, context }, testInfo) => {
  const { profile } = await owner(page);
  await context.clearCookies();
  await page.goto(`/p/${profile.id}`);
  const heading = page.getByRole('heading', { name: profile.displayName, exact: true });
  await expect(heading).toBeVisible();
  const widths = [...new Set([page.viewportSize().width, 375, 320])];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 839 });
    const metrics = await heading.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth, right: element.getBoundingClientRect().right, cardRight: element.closest('.player-card').getBoundingClientRect().right }));
    await page.screenshot({ path: testInfo.outputPath(`public-name-${width}.png`), fullPage: true });
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
    expect(metrics.right).toBeLessThanOrEqual(metrics.cardRight);
  }
});

test('SF-13: malformed and unknown public URLs show not-found without registration', async ({ page }, testInfo) => {
  for (const path of ['/p/not-an-id', '/p', '/p/', '/p/000000000000000000000000/extra', '/p/000000000000000000000000']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Profile not found.', exact: true })).toBeVisible({ timeout: 3000 });
    if (path === '/p/not-an-id') await page.screenshot({ path: testInfo.outputPath('public-not-found.png'), fullPage: true });
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create your account' })).toHaveCount(0);
  }
});
