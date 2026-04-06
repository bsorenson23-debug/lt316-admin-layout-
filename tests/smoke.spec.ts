import { test, expect } from '@playwright/test';

test('admin workspace smoke', async ({ page }) => {
  await page.goto('/admin');

  await expect(page).toHaveTitle(/LT316 Admin/);
  await expect(page.getByRole('button', { name: 'Browse Products' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Production', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Setup', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Browse Products' }).click();
  await expect(page.getByRole('heading', { name: 'Select a product' })).toBeVisible();

  await page.getByRole('button', { name: 'Select YETI Rambler 40oz' }).click();
  await expect(page.getByText('AUTO DETECT TUMBLER SIZE')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.getByText('COLOR LAYERS')).toBeVisible();
  await expect(page.getByText('PREMIUM RASTER TO SVG')).toBeVisible();

  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await expect(page.getByText('MACHINE PROFILE')).toBeVisible();
  await expect(page.getByText('SPR CALIBRATION')).toBeVisible();

  await page.getByRole('link', { name: /Calibration/ }).click();
  await expect(page).toHaveURL(/\/admin\/calibration$/);
  await expect(page.getByText('Admin Calibration Tools')).toBeVisible();
});
