import { test, expect } from '@playwright/test';
import { logout, mainDestination } from './navigation-helpers.js';

const password = 'Sprint 2 browser passphrase!';
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
async function registerApi(context, email) {
  const session = await (await context.request.get('/api/auth/session')).json();
  const response = await context.request.post('/api/auth/register', { headers: { 'X-CSRF-Token': session.csrfToken }, data: { email, password } });
  expect(response.status()).toBe(201); return (await response.json()).csrfToken;
}
const write = (context, token, method, path, data) => context.request.fetch(`/api${path}`, { method, headers: { 'X-CSRF-Token': token }, data });
async function fillOrg(page, name) {
  await page.getByLabel('Organization name').fill(name); await page.getByLabel('About the organization').fill('A competitive organization — فريق مستقل.'); await page.getByLabel('Organization region').fill('Saudi Arabia');
}
async function fillOpening(page, role) {
  await page.getByLabel('Platform', { exact: false }).selectOption('PC');
  for (const [label, value] of [['Role', role], ['Game-specific requirements', 'Rocket League 3v3 rotation and reliable communication.'], ['Minimum rank / context', 'Champion II'], ['Region', 'Middle East'], ['Language', 'Arabic / English'], ['Schedule timezone', 'Asia/Riyadh'], ['Deadline', '2099-11-04T21:00']]) await page.getByLabel(label).fill(value);
  await page.getByRole('checkbox', { name: 'Sunday', exact: true }).check();
  await page.getByLabel('Sunday end time', { exact: true }).selectOption('23:15');
  await page.getByRole('checkbox', { name: 'Friday', exact: true }).check();
  await page.getByLabel('Friday start time', { exact: true }).selectOption('22:00');
  await page.getByLabel('Friday end time', { exact: true }).selectOption('02:00');
}
async function shot(page, name, testInfo) {
  for (let index = 0; index < 3; index++) await page.keyboard.press('Escape');
  await page.getByRole('heading', { level: 1 }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('SF-14/15/18/21: organization and team routes, scoped roles, openings, persistence and revocation', async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const uid = suffix(), email = `manager-${uid}@example.com`, teamEmail = `scoped-${uid}@example.com`, orgName = `Falcons ${uid}`, roleName = `Rotation ${uid}`;
  const device = { baseURL: 'http://127.0.0.1:5174', viewport: page.viewportSize(), isMobile: testInfo.project.use.isMobile, hasTouch: testInfo.project.use.hasTouch };
  const scopedContext = await browser.newContext(device), publicContext = await browser.newContext(device);
  try {
    const scopedToken = await registerApi(scopedContext, teamEmail);
    await page.goto('/register'); await page.getByLabel('Email address').fill(email); await page.getByLabel(/^Password/).fill(password); await page.getByRole('button', { name: 'Create your account' }).click();
    await page.getByRole('link', { name: 'Create organization', exact: true }).click();
    await expect(page.getByText('Use your existing account. You’ll become this organization’s first manager.')).toBeVisible();
    await fillOrg(page, orgName); await page.getByRole('button', { name: 'Create organization page' }).click();
    await expect(page.getByRole('heading', { name: orgName, exact: true })).toBeVisible();
    const orgUrl = new URL(page.url()).pathname;
    await page.getByRole('link', { name: 'Edit organization', exact: true }).click();
    await page.getByLabel('About the organization').fill('Edited organization — persisted after login.'); await page.getByRole('button', { name: 'Save', exact: true }).click();
    for (const [name, game] of [['Falcons Rocket League', 'Rocket League'], ['Falcons Valorant', 'Valorant']]) {
      await page.getByRole('link', { name: 'Add team', exact: true }).first().click();
      await expect(page.locator('.editor-context')).toContainText(orgName);
      await page.getByLabel('Team name').fill(name); await page.getByLabel('About the team').fill(`${game} competitive roster.`); await page.getByLabel('Team game').selectOption({ label: game }); await page.getByRole('button', { name: 'Create team', exact: true }).click();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: orgName, exact: true }).click();
    }
    const management = await (await page.request.get('/api/management')).json();
    const org = management.organizations.find(item => item.name === orgName), team = management.teams.find(item => item.name === 'Falcons Rocket League'), sibling = management.teams.find(item => item.name === 'Falcons Valorant');
    const teamUrl = `${orgUrl}/teams/${team.id}`;
    await page.goto(`${teamUrl}/edit`); await expect(page.locator('.editor-context').last()).toContainText('Rocket League'); await page.getByLabel('About the team').fill('Edited team description.'); await page.getByRole('button', { name: 'Save team' }).click();
    await expect(page.getByText('Edited team description.', { exact: true })).toBeVisible(); await page.goto(orgUrl);
    await page.locator('.roles-panel > summary').click(); await page.getByLabel('Registered user email').fill(teamEmail); await page.getByLabel('Management scope').selectOption(team.id); await page.getByRole('button', { name: 'Assign manager' }).click();
    // Reloaded memberships keep the authorization source on the server.
    await page.locator('.roles-panel > summary').click(); await expect(page.getByRole('button', { name: `Revoke ${teamEmail} Falcons Rocket League`, exact: true })).toBeVisible(); await shot(page, 'organization-management', testInfo);
    const scopedPage = await scopedContext.newPage(); await scopedPage.goto(orgUrl);
    await expect(scopedPage.getByRole('heading', { name: 'Falcons Rocket League', exact: true })).toBeVisible(); await expect(scopedPage.getByRole('heading', { name: 'Falcons Valorant', exact: true })).toHaveCount(0);
    await expect(scopedPage.getByRole('link', { name: 'Edit organization', exact: true })).toHaveCount(0); await expect(scopedPage.locator('.roles-panel')).toHaveCount(0);
    await scopedPage.goto(`${orgUrl}/edit`); await expect(scopedPage.getByRole('heading', { name: 'Management access unavailable.' })).toBeVisible();
    await scopedPage.goto(`${orgUrl}/teams/${sibling.id}/edit`); await expect(scopedPage.getByRole('heading', { name: 'Management access unavailable.' })).toBeVisible();
    expect((await write(scopedContext, scopedToken, 'PUT', `/teams/${sibling.id}`, { name: 'Attacked', description: 'Must fail.' })).status()).toBe(403);
    await scopedPage.goto(teamUrl); await scopedPage.getByRole('button', { name: 'New opening', exact: true }).click(); await fillOpening(scopedPage, roleName); await shot(scopedPage, 'opening-creation', testInfo);
    await scopedPage.getByRole('button', { name: 'Publish opening', exact: true }).click(); await expect(scopedPage.getByRole('heading', { name: roleName, exact: true })).toBeVisible();
    await scopedPage.getByRole('button', { name: 'Edit opening', exact: true }).click(); await expect(scopedPage.getByLabel('Sunday end time', { exact: true })).toHaveValue('23:15'); await expect(scopedPage.getByLabel('Friday end time', { exact: true })).toHaveValue('02:00');
    await scopedPage.getByLabel('Game-specific requirements').fill('Updated Rocket League 3v3 requirements.'); await scopedPage.getByRole('button', { name: 'Save opening' }).click(); await scopedPage.reload(); await expect(scopedPage.getByRole('heading', { name: roleName, exact: true })).toBeVisible();
    const saved = (await (await scopedPage.request.get('/api/management')).json()).openings.find(item => item.role === roleName);
    expect(saved.game).toBe(team.game); expect(saved.scheduleSlots).toEqual([{ day: 'sun', start: '20:00', end: '23:15' }, { day: 'fri', start: '22:00', end: '02:00' }]);
    const publicPage = await publicContext.newPage(); await publicPage.goto(`/organizations/${org.id}`);
    await expect(publicPage.getByText('Edited organization — persisted after login.', { exact: true })).toBeVisible(); await expect(publicPage.locator('form')).toHaveCount(0); await shot(publicPage, 'public-organization', testInfo);
    await publicPage.getByRole('link', { name: 'Falcons Rocket League', exact: true }).click(); await expect(publicPage.getByRole('heading', { name: 'Active team openings' })).toBeVisible(); await shot(publicPage, 'public-team', testInfo);
    await mainDestination(publicPage, 'Openings'); await publicPage.getByLabel('Game', { exact: true }).selectOption(team.game); await publicPage.getByLabel('Role', { exact: true }).fill(uid); await publicPage.getByLabel('Region', { exact: true }).fill('Middle East'); await publicPage.getByLabel('Language', { exact: true }).fill('Arabic'); await publicPage.getByRole('button', { name: 'Apply filters' }).click();
    await expect(publicPage.getByRole('status').filter({ hasText: '1 active openings' })).toBeVisible(); const filteredUrl = publicPage.url(); await publicPage.reload(); await expect(publicPage.getByLabel('Role', { exact: true })).toHaveValue(uid); await shot(publicPage, 'filtered-openings', testInfo);
    await publicPage.getByRole('link', { name: roleName, exact: true }).click(); await expect(publicPage.getByText('Updated Rocket League 3v3 requirements.', { exact: true })).toBeVisible(); await publicPage.goBack(); await expect(publicPage).toHaveURL(filteredUrl); await expect(publicPage.getByLabel('Role', { exact: true })).toHaveValue(uid); await publicPage.goForward(); await expect(publicPage.getByRole('heading', { level: 1, name: roleName, exact: true })).toBeVisible();
    await logout(page); await page.getByLabel('Email address').fill(email); await page.getByLabel(/^Password/).fill(password); await page.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(page.getByRole('heading', { name: 'My Workspace', exact: true })).toBeVisible(); await page.goto(orgUrl);
    await page.locator('.roles-panel > summary').click(); await page.getByRole('button', { name: `Revoke ${teamEmail} Falcons Rocket League`, exact: true }).click();
    await scopedPage.getByRole('button', { name: 'Close opening', exact: true }).click(); await expect(scopedPage.getByRole('alert')).toHaveText('You cannot manage this team.');
    await page.goto(teamUrl); await page.getByRole('button', { name: 'Close opening', exact: true }).click(); await expect(page.getByText(/^Closed ·/)).toBeVisible();
    await publicPage.goto(`/openings?role=${uid}`); await expect(publicPage.getByRole('heading', { name: 'No active openings found.' })).toBeVisible(); await publicPage.goto(`/openings/${saved.id}`); await expect(publicPage.getByText('Closed', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await scopedContext.close(); await publicContext.close(); }
});

test('SF-14/21: signed-out, loading, empty, failure/retry, validation and not-found states', async ({ page }) => {
  await page.goto('/organizations'); await expect(page.getByRole('heading', { name: 'Log in to continue.' })).toBeVisible(); await expect(page.locator('form')).toHaveCount(0);
  await page.route('**/api/openings*', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.abort(); });
  await page.goto('/openings'); await expect(page.getByRole('status').filter({ hasText: 'Loading your workspace' }).first()).toBeVisible(); await expect(page.getByRole('alert')).toContainText('Cannot connect');
  await page.unroute('**/api/openings*'); await page.getByRole('button', { name: 'Try again' }).click(); await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();
  await page.getByLabel('Role', { exact: true }).fill('no-such-role-' + suffix()); await page.getByRole('button', { name: 'Apply filters' }).click(); await expect(page.getByRole('heading', { name: 'No active openings found.' })).toBeVisible();
  await page.goto('/organizations/bad'); await expect(page.getByRole('alert')).toHaveText('Page not found.');
  await registerApi(page.context(), `invalid-${suffix()}@example.com`); await page.goto('/organizations'); await expect(page.getByRole('heading', { name: 'Build something together.' })).toBeVisible();
  await page.getByRole('link', { name: 'Create organization', exact: true }).first().click(); await page.getByRole('button', { name: 'Create organization page' }).click(); expect(await page.getByLabel('Organization name').evaluate(input => input.validity.valueMissing)).toBe(true);
  await fillOrg(page, 'Validation demo'); await page.getByLabel('Organization name').fill(' '); await page.getByRole('button', { name: 'Create organization page' }).click(); await expect(page.getByRole('alert')).toHaveText('Please check the highlighted fields.'); await expect(page.getByLabel('Organization name')).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByLabel('About the organization')).toHaveValue('A competitive organization — فريق مستقل.');
});
