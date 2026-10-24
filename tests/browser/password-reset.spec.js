import { test, expect } from '@playwright/test';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

test('SF-03: request email, reset once, and log in with the new password', async ({ page }, testInfo) => {
  const email = `recovery-${testInfo.project.name}-${Date.now()}@example.com`;
  const file = resolve('.local-data/e2e-reset-mailbox', `${email}.json`);
  const password = 'Original browser passphrase!';
  const replacement = 'Replacement browser passphrase!';
  try {
    await page.goto('/');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: false }).fill(password);
    await page.getByRole('button', { name: 'Create your account' }).click();
    await expect(page.getByRole('heading', { name: 'Your journey starts here.' })).toBeVisible();
    await expect(page.locator('.toast-region')).toContainText('Account created.');
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.getByRole('button', { name: 'Log in', exact: true }).first().click();
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('forgot-password.png'), fullPage: true });
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('.auth-card').getByRole('status')).toContainText('If an active account exists');
    let mail;
    await expect.poll(async () => {
      try { mail = JSON.parse(await readFile(file, 'utf8')); return true; } catch { return false; }
    }).toBe(true);
    await page.goto(mail.link);
    await expect(page.getByLabel('New password', { exact: false }).first()).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    await page.getByLabel('New password', { exact: false }).first().fill(replacement);
    await page.getByLabel('Confirm new password').fill(password);
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Passwords must match.');
    await page.getByLabel('Confirm new password').fill(replacement);
    await page.screenshot({ path: testInfo.outputPath('new-password.png'), fullPage: true });
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?passwordReset=success$/);
    await expect(page.locator('.auth-card').getByRole('status')).toContainText('Log in with your new password.');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: false }).fill(replacement);
    await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Your journey starts here.' })).toBeVisible();
    await expect(page.locator('.toast-region')).toContainText('Logged in successfully.');
    await page.goto(mail.link);
    await expect(page.getByRole('alert')).toContainText('invalid or has already been used');
    await expect(page.getByRole('link', { name: 'Request a new reset link' })).toBeVisible();
    expect(await page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await unlink(file).catch(() => {}); }
});

test('SF-03: invalid, expired, checking, sending and delivery-unavailable states', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText('This reset link is invalid.');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/auth/reset-password/validate', async route => {
    await gate;
    await route.fulfill({ status: 410, json: { message: 'This reset link has expired. Request a new link.' } });
  });
  await page.goto(`/reset-password#${'1'.repeat(64)}`);
  await expect(page.locator('.auth-card').getByRole('status')).toContainText('Checking your reset link');
  release();
  await expect(page.getByRole('alert')).toContainText('expired');
  await page.getByRole('link', { name: 'Request a new reset link' }).click();
  let releaseRequest;
  const requestGate = new Promise(resolve => { releaseRequest = resolve; });
  await page.route('**/api/auth/forgot-password', async route => {
    await requestGate;
    await route.fulfill({ status: 503, json: { message: 'Password reset email is temporarily unavailable. Please try again later.' } });
  });
  await page.getByLabel('Email address').fill('unknown@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('button', { name: 'Sending reset link…' })).toBeDisabled();
  releaseRequest();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByLabel('Email address')).toHaveValue('unknown@example.com');
  await page.unroute('**/api/auth/forgot-password');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.locator('.auth-card').getByRole('status')).toContainText('If an active account exists');
});
