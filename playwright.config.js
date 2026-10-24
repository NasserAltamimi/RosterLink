import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot: 'only-on-failure', channel: 'chrome' },
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'node scripts/e2e-api.js', url: 'http://127.0.0.1:3002/api/health', timeout: 180000, reuseExistingServer: false },
    { command: 'npx vite --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', timeout: 60000, reuseExistingServer: false, env: { API_TARGET: 'http://127.0.0.1:3002' } },
  ],
});
