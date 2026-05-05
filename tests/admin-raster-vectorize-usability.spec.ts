import { expect, test } from "@playwright/test";

import { ensureWebGlSupport } from "./helpers/webglSupport";

test.use({
  acceptDownloads: true,
  viewport: { width: 1600, height: 1200 },
});

test("raster vectorize invalid-image errors stay operator-actionable", async ({ page }, testInfo) => {
  test.setTimeout(3 * 60 * 1000);

  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("__codex_admin_raster_vectorize_usability_reset__")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("__codex_admin_raster_vectorize_usability_reset__", "1");
    }
  });

  await ensureWebGlSupport(page, testInfo, "admin-raster-vectorize-usability");

  await page.route("**/api/admin/image/vectorize", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid image file" }),
    });
  });

  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: /Premium Raster to SVG/i }).click();

  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp,image/avif"]').setInputFiles({
    name: "broken-input.png",
    mimeType: "image/png",
    buffer: Buffer.from("not-a-real-png"),
  });

  await page.getByRole("button", { name: "Trace to SVG", exact: true }).click();

  await expect(
    page.getByText(
      "Upload a PNG, JPEG, WEBP, or AVIF image with visible artwork and try tracing again.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30_000 });
});