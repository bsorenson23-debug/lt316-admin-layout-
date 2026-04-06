import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    headless: true,
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
    channel: 'chromium',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI
          ? 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3000'
          : 'npm run dev -- --hostname 127.0.0.1 --port 3000',
        url: `${baseURL}/admin`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
