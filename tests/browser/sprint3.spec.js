import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function register(context, name) {
  const { csrfToken } = await (await context.request.get('/api/auth/session')).json();
  const response = await context.request.post('/api/auth/register', {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { email: `${name}-${crypto.randomUUID()}@example.test`, password: 'Sprint Three test passphrase!' },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).csrfToken;
}

async function post(context, token, path, data) {
  const response = await context.request.post('/api' + path, { data, headers: { 'X-CSRF-Token': token } });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createProfile(page) {
  await page.goto('/profile');
  await page.getByLabel('Gaming / display name').fill('Riyadh Recruit');
  await page.getByLabel('Region / country').fill('Saudi Arabia');
  await page.getByLabel('English', { exact: true }).check();
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Riyadh Recruit', exact: true })).toBeVisible();
  return (await (await page.request.get('/api/profiles/me')).json()).profile.id;
}

async function shot(page, project, name) {
  const dir = resolve('.local-data', 'sprint3-review', project);
  await mkdir(dir, { recursive: true });
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: resolve(dir, name + '.png'), fullPage: true, animations: 'disabled', style: '.toast-region { visibility: hidden }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

const organization = name => ({ name, description: 'Competitive esports organization based in Riyadh.', region: 'Saudi Arabia' });
const openingValues = role => ({
  role, requirements: 'Experience with 3v3 rotation and clear teammate communication.', platform: 'PC', region: 'Middle East',
  language: 'Arabic / English', scheduleSlots: [{ day: 'sun', start: '20:00', end: '23:00' }], timezone: 'Asia/Riyadh', deadline: '2099-11-04T23:59:00+03:00',
});

test('Sprint 3 recruitment and dual-role journey', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(90000);
  const options = { baseURL, viewport: page.viewportSize(), isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch, timezoneId: 'Asia/Riyadh' };
  const managerContext = await browser.newContext(options);
  const guestContext = await browser.newContext(options);
  try {
    const playerToken = await register(page.context(), 'applicant');
    const managerToken = await register(managerContext, 'recruiter');
    const profile = await createProfile(page);
    const { games } = await (await page.request.get('/api/games')).json();
    const gameId = games.find(game => game.slug === 'rocket-league')._id;
    const playerOrg = (await post(page.context(), playerToken, '/organizations', organization('Riyadh Academy'))).organization;
    await page.reload();
    const affiliations = page.locator('#my-organizations');
    await expect(affiliations.getByText('Organization manager', { exact: true })).toBeVisible();
    const publicPage = await guestContext.newPage();
    await publicPage.goto(`/p/${profile}`);
    await expect(publicPage.getByRole('heading', { name: 'Riyadh Recruit' })).toBeVisible();
    await expect(publicPage.getByRole('heading', { name: 'Affiliations' })).toHaveCount(0);
    await affiliations.getByRole('checkbox', { name: /Show on public profile for Riyadh Academy/ }).check();
    await expect(page.getByText('Affiliation visible on your public profile.')).toBeVisible();
    await shot(page, info.project.name, 'profile-organizations');
    await publicPage.reload();
    await expect(publicPage.getByRole('link', { name: 'Riyadh Academy' })).toHaveAttribute('href', `/organizations/${playerOrg.id}`);
    await shot(publicPage, info.project.name, 'public-affiliation');
    await affiliations.getByRole('link', { name: 'Riyadh Academy' }).click();
    await page.getByRole('link', { name: 'Add team', exact: true }).first().click();
    await page.getByLabel('Team name').fill('Academy RL');
    await page.getByLabel('About the team').fill('Rocket League development team.');
    await page.getByLabel('Team game').selectOption(gameId);
    await page.getByRole('button', { name: 'Create team', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Academy RL', exact: true })).toBeVisible();

    const org = (await post(managerContext, managerToken, '/organizations', organization('Falcons Club'))).organization;
    const team = (await post(managerContext, managerToken, `/organizations/${org.id}/teams`, { name: 'Falcons RL', description: 'Main Rocket League roster.', gameId })).team;
    const role = 'Rotation player';
    const opening = (await post(managerContext, managerToken, `/teams/${team.id}/openings`, openingValues(role))).opening;
    await page.goto(`/openings/${opening.id}`);
    await page.getByLabel('Why are you a good fit?').fill('I lead communication during 3v3 rotations.');
    await page.getByLabel('Availability for this team').fill('Sunday after 20:00 Asia/Riyadh.');
    await shot(page, info.project.name, 'opening-application');
    await page.getByRole('button', { name: 'Submit application' }).click();
    await expect(page.getByText('Application submitted. You can track its status here.')).toBeVisible();
    await expect(page.locator('.application-status')).toHaveText('Submitted');
    const applicationUrl = new URL(page.url()).pathname;
    await page.getByRole('link', { name: 'My Applications', exact: true }).click();
    await expect(page.getByRole('link', { name: role })).toBeVisible();
    const manager = await managerContext.newPage();
    await manager.goto(`/openings/${opening.id}`);
    await manager.getByRole('link', { name: 'Review applicants' }).click();
    await manager.getByLabel('Application status').selectOption('submitted');
    await shot(manager, info.project.name, 'applicant-list');
    await manager.getByRole('link', { name: 'Review application' }).click();
    await expect(manager.getByRole('link', { name: 'View public player profile' })).toHaveAttribute('href', `/p/${profile}`);
    await manager.getByRole('button', { name: 'Mark in review' }).click();
    await expect(manager.locator('.application-status')).toHaveText('In review');
    await manager.getByRole('button', { name: 'Shortlist', exact: true }).click();
    await expect(manager.locator('.application-status')).toHaveText('Shortlisted');
    await manager.getByRole('button', { name: 'Send tryout invitation' }).click();
    await manager.getByLabel('Tryout date and time').fill('2099-11-05T20:00');
    await manager.getByLabel('Tryout notes').fill('Join the practice lobby 10 minutes early.');
    await manager.getByRole('button', { name: 'Send tryout invitation' }).click();
    await expect(manager.getByText('Awaiting response', { exact: true })).toBeVisible();
    await shot(manager, info.project.name, 'manager-review');
    await page.getByRole('link', { name: 'Notifications', exact: true }).click();
    await expect(page.getByRole('link', { name: 'New tryout invitation' })).toBeVisible();
    await shot(page, info.project.name, 'notifications');
    await page.getByRole('link', { name: 'New tryout invitation' }).click();
    await expect(page).toHaveURL(new RegExp(applicationUrl + '$'));
    await expect(page.getByText('Join the practice lobby 10 minutes early.')).toBeVisible();
    await shot(page, info.project.name, 'player-tryout');
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page.locator('.application-invitation .badge')).toHaveText('Accepted');
    await manager.getByRole('link', { name: 'Notifications', exact: true }).click();
    await manager.getByRole('link', { name: 'Tryout invitation accepted' }).click();
    await expect(manager.locator('.application-invitation .badge')).toHaveText('Accepted');
    await manager.getByRole('button', { name: 'Accept application' }).click();
    await manager.getByRole('button', { name: 'Accept application' }).click();
    await expect(manager.locator('.application-status')).toHaveText('Accepted');
    await page.reload();
    await expect(page.locator('.application-status')).toHaveText('Accepted');
    await shot(page, info.project.name, 'final-decision');

    const second = (await post(managerContext, managerToken, `/teams/${team.id}/openings`, openingValues('Substitute player'))).opening;
    await page.goto(`/openings/${second.id}`);
    await page.getByLabel('Why are you a good fit?').fill('Available for substitute sessions.');
    await page.getByLabel('Availability for this team').fill('Friday after 20:00 Asia/Riyadh.');
    await page.getByRole('button', { name: 'Submit application' }).click();
    await expect(page.locator('.application-status')).toHaveText('Submitted');
    await page.getByRole('button', { name: 'Withdraw application' }).click();
    await page.getByRole('button', { name: 'Withdraw application' }).click();
    await expect(page.locator('.application-status')).toHaveText('Withdrawn');
  } finally {
    await managerContext.close(); await guestContext.close();
  }
});

test('Sprint 3 profile tournament lookup and outage fallback', async ({ page }, info) => {
  await register(page.context(), 'tournament');
  const profile = await createProfile(page);
  await page.goto('/profile/games');
  await page.getByRole('radio', { name: 'Fortnite', exact: true }).check();
  await page.getByLabel('Platform', { exact: false }).selectOption('PC');
  await page.getByRole('combobox', { name: 'Play region' }).selectOption('Middle East');
  await page.getByRole('combobox', { name: /^Rank/ }).selectOption('Elite');
  await page.getByRole('group', { name: 'Communication language(s)' }).getByLabel('English', { exact: true }).check();
  await page.getByLabel('Availability', { exact: false }).fill('Sunday evenings in Asia/Riyadh.');
  await page.getByLabel('Search Liquipedia for Fortnite tournaments').fill('community cup');
  await page.getByRole('button', { name: 'Add Fixture Community Cup' }).click();
  await page.getByLabel('Manual result (self-reported)').fill('Top 8');
  await shot(page, info.project.name, 'liquipedia-selection');
  await page.getByRole('button', { name: 'Add game section', exact: true }).click();
  await expect(page.getByText(/Retrieved .*UTC/)).toBeVisible();
  await page.goto(`/p/${profile}`);
  await expect(page.getByRole('link', { name: 'Liquipedia', exact: true })).toHaveAttribute('href', 'https://liquipedia.net/fortnite/Fixture/Cup');
  await expect(page.getByText(/Top 8/)).toBeVisible();
  await page.goto('/profile/games');
  await page.getByRole('radio', { name: 'Rocket League', exact: true }).check();
  await page.getByLabel('Search Liquipedia for Rocket League tournaments').fill('cup');
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await page.getByRole('button', { name: 'Add tournament manually' }).click();
  await expect(page.getByLabel('Competition name')).toBeVisible();
});
