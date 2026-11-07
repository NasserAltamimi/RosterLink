import { test, expect } from '@playwright/test';
import { logout, mainDestination } from './navigation-helpers.js';

const password = 'Unified workspace test passphrase!';
async function register(page) {
  const email = `navigation-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/register'); await page.getByLabel('Email address').fill(email); await page.getByLabel(/^Password/).fill(password); await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(/\/workspace$/); await expect(page.getByRole('heading', { name: 'Your journey starts here.' })).toBeVisible();
  return email;
}
async function shot(page, testInfo, name, dismiss = true) {
  if (dismiss) for (let index = 0; index < 3; index++) await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('SF-01/02/04: one-account starting actions, shared navigation, profile routes, session and history', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const email = await register(page);
  await expect(page.getByText('Both are available through the same account, whenever you’re ready.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create player profile', exact: true })).toHaveAttribute('href', '/profile');
  await expect(page.getByRole('link', { name: 'Create organization', exact: true })).toHaveAttribute('href', '/organizations/new');
  await shot(page, testInfo, 'workspace-start');
  await page.getByRole('link', { name: 'Create organization', exact: true }).click(); await expect(page).toHaveURL(/\/organizations\/new$/); await expect(page.getByLabel('Organization name')).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/\/workspace$/);
  await page.getByRole('link', { name: 'Create player profile', exact: true }).click(); await page.getByLabel('Gaming / display name').fill('Connected Pilot'); await page.getByLabel('Region / country').fill('Saudi Arabia'); await page.getByLabel('English', { exact: true }).check(); await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connected Pilot', exact: true })).toBeVisible(); await shot(page, testInfo, 'profile-overview');
  await page.getByRole('link', { name: 'Edit profile', exact: true }).first().click(); await expect(page).toHaveURL(/\/profile\/edit$/); await page.getByLabel('About you').fill('A connected account experience.'); await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.locator('.toast-region')).toContainText('Profile saved.');
  await page.reload(); await expect(page.getByLabel('About you')).toHaveValue('A connected account experience.');
  await page.getByRole('link', { name: 'Game profiles', exact: true }).click(); await expect(page).toHaveURL(/\/profile\/games$/); await page.goBack(); await expect(page).toHaveURL(/\/profile\/edit$/); await expect(page.getByLabel('About you')).toHaveValue('A connected account experience.');
  await mainDestination(page, 'Openings'); await expect(page.getByRole('heading', { name: 'Recruitment openings' })).toBeVisible(); await mainDestination(page, 'Organizations'); await expect(page.getByRole('heading', { name: 'Build something together.' })).toBeVisible(); await shot(page, testInfo, 'organizations-empty');
  await mainDestination(page, 'My Workspace'); await expect(page.getByRole('link', { name: 'View my profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click(); await expect(page.getByText(email, { exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeFocused();
  await logout(page); await expect(page).toHaveURL(/\/login$/); await page.goto('/profile/edit'); await expect(page.getByRole('heading', { name: 'Log in to continue.' })).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Log in', exact: true }).click(); await expect(page).toHaveURL(/next=%2Fprofile%2Fedit/); await page.getByLabel('Email address').fill(email); await page.getByLabel(/^Password/).fill(password); await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/edit$/); await expect(page.getByLabel('About you')).toHaveValue('A connected account experience.'); await page.reload(); await expect(page.getByLabel('About you')).toHaveValue('A connected account experience.');
  expect(errors).toEqual([]);
});

test('SF-02/21: public links, accessible menus, current destination, direct URLs and narrow screens', async ({ page }, testInfo) => {
  await page.goto('/openings'); await expect(page.getByRole('heading', { name: 'Recruitment openings' })).toBeVisible();
  for (const width of [...new Set([page.viewportSize().width, 390, 320])]) {
    await page.setViewportSize({ width, height: 844 });
    const menu = page.locator('button[aria-controls="site-navigation"]');
    if (await menu.isVisible()) {
      await menu.focus(); await page.keyboard.press('Enter'); await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Openings', exact: true })).toHaveAttribute('aria-current', 'page');
      await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
      await menu.click(); await shot(page, testInfo, `public-menu-${width}`, false);
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Register', exact: true }).click();
      await expect(page.getByLabel('Email address')).toBeVisible(); await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await page.goto('/openings');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/manage'); await expect(page.getByRole('heading', { name: 'Log in to continue.' })).toBeVisible();
  await page.goto('/unknown-route'); await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
});

test('SF-02/18: expired session removes management UI, login redirect cannot leave the site', async ({ page, context }) => {
  const email = await register(page); await page.goto('/organizations/new'); await expect(page.getByLabel('Organization name')).toBeVisible();
  await context.clearCookies(); await page.getByLabel('Organization name').fill('Expired session organization'); await page.getByLabel('About the organization').fill('Must not be saved.'); await page.getByLabel('Organization region').fill('Saudi Arabia'); await page.getByRole('button', { name: 'Create organization page' }).click();
  await expect(page.getByRole('heading', { name: 'Log in to continue.' })).toBeVisible(); await expect(page.getByLabel('Organization name')).toHaveCount(0);
  await page.goto('/login?next=https%3A%2F%2Fevil.example'); await expect(page.getByLabel('Email address')).toBeVisible();
  await page.getByLabel('Email address').fill(email); await page.getByLabel(/^Password/).fill(password); await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
});
