import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
    channel: 'chromium',
  },
});
