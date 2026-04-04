import { expect, test } from '@playwright/test';

test('smoke', async ({ page }) => {
  await page.goto('data:text/html,<title>Smoke</title><h1>ok</h1>');
  await expect(page).toHaveTitle('Smoke');
});
