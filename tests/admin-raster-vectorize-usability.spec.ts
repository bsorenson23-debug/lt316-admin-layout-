import { expect, test, type Page } from "@playwright/test";

import { ensureWebGlSupport } from "./helpers/webglSupport";

test.use({
  acceptDownloads: true,
  viewport: { width: 1600, height: 1200 },
});

async function openRasterVectorizePanel(page: Page) {
  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: /Premium Raster to SVG/i }).click();
}

async function uploadRasterFixture(page: Page) {
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp,image/avif"]').setInputFiles({
    name: "broken-input.png",
    mimeType: "image/png",
    buffer: Buffer.from("not-a-real-png"),
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("__codex_admin_raster_vectorize_usability_reset__")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("__codex_admin_raster_vectorize_usability_reset__", "1");
    }
  });
});

test("raster vectorize sanitizes raw decode/backend errors", async ({ page }, testInfo) => {
  test.setTimeout(3 * 60 * 1000);

  await ensureWebGlSupport(page, testInfo, "admin-raster-vectorize-usability");

  await page.route("**/api/admin/image/vectorize", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "IDAT stream error from Sharp stack" }),
    });
  });

  await openRasterVectorizePanel(page);
  await uploadRasterFixture(page);

  await page.getByRole("button", { name: "Trace to SVG", exact: true }).click();

  await expect(
    page.getByText(
      "Image could not be read. Upload a valid PNG, JPG, WebP, AVIF, or SVG and try again.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/pngload_buffer/i)).toHaveCount(0);
  await expect(page.getByText(/IDAT/i)).toHaveCount(0);
  await expect(page.getByText(/end of stream/i)).toHaveCount(0);
  await expect(page.getByText(/Sharp/i)).toHaveCount(0);
  await expect(page.getByText(/stack/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Trace to SVG", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose File", exact: true })).toBeVisible();
});

test("raster vectorize oversized uploads show resize guidance and keep retry available", async ({ page }, testInfo) => {
  test.setTimeout(3 * 60 * 1000);

  await ensureWebGlSupport(page, testInfo, "admin-raster-vectorize-usability-too-large");

  await page.route("**/api/admin/image/vectorize", async (route) => {
    await route.fulfill({
      status: 413,
      contentType: "application/json",
      body: JSON.stringify({ error: "Image too large. Maximum upload is 15MB." }),
    });
  });

  await openRasterVectorizePanel(page);
  await uploadRasterFixture(page);

  await page.getByRole("button", { name: "Trace to SVG", exact: true }).click();

  await expect(
    page.getByText(
      "Image is too large. Resize or compress it, then try again.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Trace to SVG", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose File", exact: true })).toBeVisible();
});

test("raster vectorize non-json failures fall back to safe operator guidance", async ({ page }, testInfo) => {
  test.setTimeout(3 * 60 * 1000);

  await ensureWebGlSupport(page, testInfo, "admin-raster-vectorize-usability-non-json");

  await page.route("**/api/admin/image/vectorize", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "text/html",
      body: "<html><body>Internal Server Error: stack trace</body></html>",
    });
  });

  await openRasterVectorizePanel(page);
  await uploadRasterFixture(page);

  await page.getByRole("button", { name: "Trace to SVG", exact: true }).click();

  await expect(
    page.getByText(
      "Image could not be vectorized. Upload a clear PNG, JPG, WebP, AVIF, or SVG and try again.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/stack/i)).toHaveCount(0);
  await expect(page.getByText(/internal server error/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Trace to SVG", exact: true })).toBeVisible();
});