import { test, expect } from '@playwright/test';

async function register(context, label) {
  const { csrfToken } = await (await context.request.get('/api/auth/session')).json();
  const response = await context.request.post('/api/auth/register', {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { email: `${label}-${crypto.randomUUID()}@example.test`, password: 'RosterLink post browser passphrase!' },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

const mutation = (context, csrfToken, method, path, data) =>
  context.request.fetch('/api' + path, { method, data, headers: { 'X-CSRF-Token': csrfToken } });

async function create(context, token, path, data) {
  const response = await mutation(context, token, 'POST', path, data);
  expect(response.status()).toBe(201);
  return response.json();
}

const profileValues = displayName => ({ displayName, region: 'Riyadh', languages: ['Arabic', 'English'], bio: '' });
const clubValues = name => ({ name, region: 'Saudi Arabia', description: 'Competitive esports and community practice.' });
const postCard = (page, body) => page.getByRole('article', { name: /^Post by/ }).filter({ hasText: body });

test('publish and interact across player, organization, and scoped team posts', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(90000);
  const contextOptions = { baseURL, viewport: page.viewportSize(), isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch };
  const [teamContext, otherContext, guestContext] = await Promise.all(Array.from({ length: 3 }, () => browser.newContext(contextOptions)));
  try {
    const owner = page.context();
    const [organizer, scoped, outsider] = await Promise.all([
      register(owner, 'club'), register(teamContext, 'team'), register(otherContext, 'other'),
    ]);
    const { profile } = await create(owner, organizer.csrfToken, '/profiles', profileValues('Night Pilot'));
    await create(otherContext, outsider.csrfToken, '/profiles', profileValues('Second Club Coach'));
    await create(otherContext, outsider.csrfToken, '/organizations', clubValues('Another Club'));
    const { organization } = await create(owner, organizer.csrfToken, '/organizations', clubValues('Night Pilot Club'));
    const organizationPath = `/organizations/${organization.id}`;
    const { games } = await (await page.request.get('/api/games')).json();
    const { team } = await create(owner, organizer.csrfToken, organizationPath + '/teams', {
      name: 'Night Circuit RL', description: 'Rocket League 3v3.', gameId: games.find(game => game.slug === 'rocket-league')._id,
    });
    const assigned = await mutation(owner, organizer.csrfToken, 'POST', organizationPath + '/roles', { email: scoped.user.email, teamId: team.id });
    expect(assigned.status()).toBe(204);

    const teamEditor = await teamContext.newPage();
    const other = await otherContext.newPage();
    const guest = await guestContext.newPage();
    for (const [kind, id, name, publisher, editorPath, publicPath, body] of [
      ['player', profile.id, 'Night Pilot', page, '/profile', `/p/${profile.id}`, 'تمرين اليوم · Player replay notes'],
      ['organization', organization.id, organization.name, page, '/manage' + organizationPath, organizationPath, 'The club is running a replay night.'],
      ['team', team.id, team.name, teamEditor, `/manage${organizationPath}/teams/${team.id}`, `/teams/${team.id}`, 'The Rocket League roster will scrim tonight.'],
    ]) {
      await publisher.goto(editorPath);
      await publisher.getByRole('link', { name: 'Posts', exact: true }).click();
      const composer = publisher.locator('.post-composer');
      await expect(composer.getByText(name, { exact: true })).toBeVisible();
      await expect(composer.getByText(new RegExp(`Posting as an? ${kind}`))).toBeVisible();
      await composer.getByLabel('Write a post').fill(body);
      await composer.getByRole('button', { name: 'Publish post' }).click();
      await expect(postCard(publisher, body)).toBeVisible();

      await other.goto(publicPath);
      await other.getByRole('link', { name: 'Posts', exact: true }).click();
      const shown = postCard(other, body);
      await expect(shown.getByRole('link', { name, exact: true })).toHaveAttribute('href', publicPath);
      await expect(shown.locator('time')).toBeVisible();
      await expect(other.getByLabel('Write a post')).toHaveCount(0);
      await expect(shown.getByRole('button', { name: 'Edit post' })).toHaveCount(0);
      await expect(shown.getByRole('button', { name: 'Delete post' })).toHaveCount(0);
      if (kind === 'player') {
        await expect(shown.locator('.post-body')).toHaveCSS('direction', 'rtl');
        await other.evaluate(() => { document.documentElement.dir = 'rtl'; });
        expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      const reaction = shown.getByRole('button', { name: /^React,/ });
      await reaction.click();
      await expect(reaction).toHaveAttribute('aria-pressed', 'true');
      await expect(reaction).toHaveAccessibleName('React, 1 reaction');
      await shown.getByRole('button', { name: '0 comments' }).click();
      await shown.getByLabel('Write a comment').fill('Looking forward to it!');
      await shown.getByRole('button', { name: 'Post comment' }).click();
      await expect(shown.getByRole('button', { name: '1 comment' })).toBeVisible();

      await guest.goto(publicPath);
      const guestPost = postCard(guest, body);
      await guestPost.getByRole('button', { name: '1 comment' }).click();
      await expect(guestPost.getByText('Looking forward to it!')).toBeVisible();
      await expect(guestPost.getByText('1 reaction', { exact: true })).toBeVisible();
      await expect(guestPost.getByRole('link', { name: 'Second Club Coach' })).toBeVisible();
      await expect(guestPost.getByLabel('Write a comment')).toHaveCount(0);
      await expect(guestPost.getByRole('button', { name: 'Delete comment' })).toHaveCount(0);

      const scope = `/posts/by/${kind}/${id}`;
      const { posts: [{ id: postId }] } = await (await other.request.get('/api' + scope)).json();
      for (const [method, path] of [['POST', scope], ['PATCH', '/posts/' + postId], ['DELETE', '/posts/' + postId]]) {
        const rejected = await mutation(otherContext, outsider.csrfToken, method, path, { body: 'Unrelated manager attempt' });
        expect(rejected.status()).toBe(403);
      }
      await shown.getByRole('button', { name: 'Delete comment' }).click();
      await expect(shown.getByRole('button', { name: '0 comments' })).toBeVisible();
      await reaction.click();
      await expect(reaction).toHaveAttribute('aria-pressed', 'false');

      const card = postCard(publisher, body);
      await card.getByRole('button', { name: 'Edit post' }).click();
      await card.getByLabel('Edit post text').fill(body + ' Edited update.');
      await card.getByRole('button', { name: 'Save changes' }).click();
      await expect(card.getByText('Edited', { exact: true })).toBeVisible();
      await other.reload();
      await expect(postCard(other, body + ' Edited update.')).toBeVisible();
      await card.getByRole('button', { name: 'Delete post', exact: true }).click();
      await card.getByRole('button', { name: 'Confirm delete post' }).click();
      await expect(card).toHaveCount(0);
      await guest.reload();
      await expect(guestPost).toHaveCount(0);
    }
  } finally {
    await Promise.all([teamContext.close(), otherContext.close(), guestContext.close()]);
  }
});
