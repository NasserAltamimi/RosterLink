import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const password = 'Sprint 2 browser passphrase!';
const futureLocal = '2099-11-04T21:00';
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
async function registerApi(context, email) {
  const session = await (await context.request.get('/api/auth/session')).json();
  const response = await context.request.post('/api/auth/register', { headers: { 'X-CSRF-Token': session.csrfToken }, data: { email, password } });
  expect(response.status()).toBe(201); return (await response.json()).csrfToken;
}
async function write(context, token, method, path, data) {
  return context.request.fetch(`/api${path}`, { method, headers: { 'X-CSRF-Token': token }, data });
}
async function fillOrg(page, name) {
  await page.getByLabel('Organization name').fill(name); await page.getByLabel('About the organization').fill('A competitive organization — فريق مستقل.'); await page.getByLabel('Organization region').fill('Saudi Arabia');
}
async function fillOpening(page, role) {
  await page.getByLabel('Platform', { exact: false }).selectOption('PC');
  for (const [label, value] of [['Role', role], ['Game-specific requirements', 'Rocket League 3v3 rotation, replay reviews, and reliable communication.'], ['Minimum rank / context', 'Champion II or equivalent'], ['Region', 'Middle East'], ['Language', 'Arabic / English'], ['Schedule timezone', 'Asia/Riyadh'], ['Deadline', futureLocal]]) await page.getByLabel(label).fill(value);
  await page.getByRole('checkbox', { name: 'Sunday', exact: true }).check();
  await page.getByLabel('Sunday end time', { exact: true }).selectOption('23:15');
  await page.getByRole('checkbox', { name: 'Friday', exact: true }).check();
  await page.getByLabel('Friday start time', { exact: true }).selectOption('22:00');
  await page.getByLabel('Friday end time', { exact: true }).selectOption('02:00');
}
async function shot(page, name, testInfo) {
  await mkdir('docs/evidence/sprint-2', { recursive: true });
  // The existing toast stack holds at most three; Escape dismisses the newest.
  for (let index = 0; index < 3; index++) await page.keyboard.press('Escape');
  // Capture from the top with inputs blurred; offscreen fixed skip-links should stay offscreen.
  await page.getByRole('heading', { level: 1 }).click();
  await page.screenshot({ path: `docs/evidence/sprint-2/${testInfo.project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('SF-14–21 UI create/edit organization and teams, scoped roles, publish/filter/edit/close; refresh and new login', async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const uid = suffix(), email = `manager-${uid}@example.com`, teamEmail = `scoped-${uid}@example.com`;
  const orgName = `Falcons ${uid}`, roleName = `Rotation ${uid}`;
  const device = { baseURL: 'http://127.0.0.1:5174', viewport: page.viewportSize(), isMobile: testInfo.project.use.isMobile, hasTouch: testInfo.project.use.hasTouch };
  const scopedContext = await browser.newContext(device);
  const otherContext = await browser.newContext(device);
  scopedContext.setDefaultTimeout(10000); otherContext.setDefaultTimeout(10000);
  try {
    const scopedToken = await registerApi(scopedContext, teamEmail);
    const otherToken = await registerApi(otherContext, `wolves-${uid}@example.com`);
    const wolves = await write(otherContext, otherToken, 'POST', '/organizations', { name: `Wolves ${uid}`, description: 'An unrelated organization.', region: 'Europe', website: '' }); expect(wolves.status()).toBe(201);
    await page.goto('/'); await page.getByLabel('Email address').fill(email); await page.getByLabel(/^Password/).fill(password); await page.getByRole('button', { name: 'Create your account' }).click();
    await expect(page.getByRole('heading', { name: 'Your journey starts here.' })).toBeVisible();
    await page.getByRole('link', { name: 'Manage organization' }).click();
    await page.getByRole('button', { name: 'Create organization', exact: true }).click(); await fillOrg(page, orgName);
    await page.getByRole('button', { name: 'Create organization page' }).click();
    await expect(page.getByRole('heading', { name: orgName, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit organization', exact: true }).click();
    await page.getByLabel('About the organization').fill('Edited organization — persisted after login.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Add team', exact: true }).click();
    await page.getByLabel('Team name').fill('Falcons Rocket League'); await page.getByLabel('About the team').fill('Rocket League competitive roster.');
    await page.getByLabel('Team game').selectOption({ label: 'Rocket League' }); await page.getByRole('button', { name: 'Create team', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Falcons Rocket League', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add team', exact: true }).click();
    await page.getByLabel('Team name').fill('Falcons Valorant'); await page.getByLabel('About the team').fill('Valorant tactical roster.'); await page.getByLabel('Team game').selectOption({ label: 'Valorant' }); await page.getByRole('button', { name: 'Create team', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Falcons Valorant', exact: true })).toBeVisible();
    const management = await (await page.request.get('/api/management')).json(); const org = management.organizations.find(item => item.name === orgName), team = management.teams.find(item => item.name === 'Falcons Rocket League'), sibling = management.teams.find(item => item.name === 'Falcons Valorant');
    await page.getByLabel('Registered user email').fill(teamEmail); await page.getByLabel('Management scope').selectOption(team.id); await page.getByRole('button', { name: 'Assign manager' }).click();
    await expect(page.getByRole('button', { name: `Revoke ${teamEmail} Falcons Rocket League`, exact: true })).toBeVisible();
    await shot(page, 'roles-and-teams', testInfo);
    // Scoped user uses the actual browser UI; unrelated team is absent and API access is denied.
    const scopedPage = await scopedContext.newPage(); await scopedPage.goto('/manage');
    await expect(scopedPage.getByRole('heading', { name: 'Falcons Rocket League', exact: true })).toBeVisible(); await expect(scopedPage.getByRole('heading', { name: 'Falcons Valorant', exact: true })).toHaveCount(0);
    expect((await write(scopedContext, scopedToken, 'PUT', `/teams/${sibling.id}`, { name: 'Attacked', description: 'Must fail.' })).status()).toBe(403);
    await scopedPage.getByRole('button', { name: 'New opening', exact: true }).click(); await fillOpening(scopedPage, roleName);
    await shot(scopedPage, 'opening-creation', testInfo);
    await scopedPage.getByRole('button', { name: 'Publish opening', exact: true }).click(); await expect(scopedPage.getByRole('heading', { name: roleName, exact: true })).toBeVisible();
    await scopedPage.getByRole('button', { name: 'Edit opening', exact: true }).click();
    await expect(scopedPage.getByLabel('Sunday end time', { exact: true })).toHaveValue('23:15');
    await expect(scopedPage.getByLabel('Friday end time', { exact: true })).toHaveValue('02:00');
    await scopedPage.getByLabel('Game-specific requirements').fill('Updated Rocket League 3v3 requirements.'); await scopedPage.getByRole('button', { name: 'Save opening' }).click();
    await scopedPage.reload(); await expect(scopedPage.getByRole('heading', { name: roleName, exact: true })).toBeVisible();
    const saved = (await (await scopedPage.request.get('/api/management')).json()).openings.find(item => item.role === roleName);
    expect(saved.requirements).toBe('Updated Rocket League 3v3 requirements.'); expect(saved.game).toBe(team.game);
    expect(saved.scheduleSlots).toEqual([{ day: 'sun', start: '20:00', end: '23:15' }, { day: 'fri', start: '22:00', end: '02:00' }]);
    expect(saved.schedule).toBe('Sun 20:00–23:15; Fri 22:00–02:00 (+1 day)');
    // Public pages have no management form, including in an unrelated manager's session.
    const publicPage = await otherContext.newPage(); await publicPage.goto(`/organizations/${org.id}`);
    await expect(publicPage.getByText('Edited organization — persisted after login.', { exact: true })).toBeVisible(); await expect(publicPage.locator('form')).toHaveCount(0); await shot(publicPage, 'organization', testInfo);
    await publicPage.getByRole('link', { name: 'Falcons Rocket League', exact: true }).click(); await expect(publicPage.getByRole('heading', { name: 'Active team openings' })).toBeVisible(); await shot(publicPage, 'team', testInfo);
    await publicPage.goto('/openings'); await publicPage.getByLabel('Game', { exact: true }).selectOption(team.game); await publicPage.getByLabel('Role', { exact: true }).fill(uid); await publicPage.getByLabel('Region', { exact: true }).fill('Middle East'); await publicPage.getByLabel('Language', { exact: true }).fill('Arabic'); await publicPage.getByRole('button', { name: 'Apply filters' }).click();
    await expect(publicPage.getByRole('status').filter({ hasText: '1 active openings' })).toBeVisible(); await expect(publicPage.getByRole('heading', { name: roleName, exact: true })).toBeVisible(); await shot(publicPage, 'filtered-openings', testInfo);
    await publicPage.getByRole('link', { name: roleName, exact: true }).click(); await expect(publicPage.getByText('Updated Rocket League 3v3 requirements.', { exact: true })).toBeVisible();
    // A new login restores persisted organizations/teams/openings without a player profile prerequisite.
    await page.goto('/'); await page.getByRole('button', { name: 'Log out', exact: true }).click(); await page.getByRole('button', { name: 'Log in', exact: true }).click(); await page.getByLabel('Email address').fill(email); await page.getByLabel(/^Password/).fill(password); await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Your journey starts here.' })).toBeVisible(); await page.goto('/manage'); await expect(page.getByRole('heading', { name: roleName, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Revoke ${teamEmail} Falcons Rocket League`, exact: true }).click(); await expect(page.getByRole('button', { name: `Revoke ${teamEmail} Falcons Rocket League`, exact: true })).toHaveCount(0);
    // Stale scoped UI cannot bypass revocation.
    await scopedPage.getByRole('button', { name: 'Close opening', exact: true }).click(); await expect(scopedPage.getByRole('alert')).toHaveText('You cannot manage this team.');
    await page.getByRole('button', { name: 'Close opening', exact: true }).click(); await expect(page.getByText(/^Closed ·/)).toBeVisible();
    await publicPage.goto('/openings'); await publicPage.getByLabel('Role', { exact: true }).fill(uid); await publicPage.getByRole('button', { name: 'Apply filters' }).click(); await expect(publicPage.getByRole('heading', { name: 'No active openings found.' })).toBeVisible();
    await publicPage.goto(`/openings/${saved.id}`); await expect(publicPage.getByText('Closed', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await scopedContext.close(); await otherContext.close(); }
});

test('SF-14–21 anonymous, loading, empty, failure/retry, invalid input and not-found states', async ({ page }) => {
  await page.goto('/manage'); await expect(page.getByRole('alert')).toHaveText('Please log in to continue.'); await expect(page.getByRole('link', { name: 'Log in to manage your organizations' })).toBeVisible();
  await page.route('**/api/openings*', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.abort(); });
  await page.goto('/openings'); await expect(page.getByRole('status').filter({ hasText: 'Loading your workspace' }).first()).toBeVisible(); await expect(page.getByRole('alert')).toContainText('Cannot connect');
  await page.unroute('**/api/openings*'); await page.getByRole('button', { name: 'Try again' }).click(); await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();
  await page.getByLabel('Role', { exact: true }).fill('no-such-role-' + suffix()); await page.getByRole('button', { name: 'Apply filters' }).click(); await expect(page.getByRole('heading', { name: 'No active openings found.' })).toBeVisible();
  await page.goto('/organizations/bad'); await expect(page.getByRole('alert')).toHaveText('Page not found.');
  await registerApi(page.context(), `invalid-${suffix()}@example.com`); await page.goto('/manage'); await page.getByRole('button', { name: 'Create organization', exact: true }).click();
  await page.getByRole('button', { name: 'Create organization page' }).click(); expect(await page.getByLabel('Organization name').evaluate(input => input.validity.valueMissing)).toBe(true);
  await fillOrg(page, 'Validation demo'); await page.getByLabel('Organization name').fill(' '); await page.getByRole('button', { name: 'Create organization page' }).click(); await expect(page.getByRole('alert')).toHaveText('Please check the highlighted fields.'); await expect(page.getByLabel('Organization name')).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByLabel('About the organization')).toHaveValue('A competitive organization — فريق مستقل.');
});
