import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npx next dev --hostname 127.0.0.1 --port 3210',
    url: 'http://127.0.0.1:3210',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3210',
    headless: true,
    channel: 'chromium',
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },
});
