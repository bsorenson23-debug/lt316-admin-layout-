import { expect, test } from "@playwright/test";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0u8AAAAASUVORK5CYII=",
  "base64",
);

const STANLEY_AUTO_DETECT_RESPONSE = {
  analysis: {
    productType: "tumbler",
    brand: "Stanley",
    model: "Quencher H2.0 40oz",
    capacityOz: 40,
    hasHandle: true,
    shapeType: "tapered",
    confidence: 0.94,
    searchQuery: "Stanley Quencher H2.0 40oz",
    notes: ["Matched Stanley Quencher H2.0 40oz profile."],
  },
  suggestion: {
    productType: "tumbler",
    brand: "Stanley",
    model: "Quencher H2.0 40oz",
    capacityOz: 40,
    hasHandle: true,
    shapeType: "tapered",
    overallHeightMm: 273.8,
    outsideDiameterMm: 99.82,
    topDiameterMm: 99.82,
    bottomDiameterMm: 78.7,
    usableHeightMm: 216,
    confidence: 0.94,
    sources: [
      {
        title: "Fixture profile",
        url: "https://example.com/stanley-quencher-40",
        kind: "internal",
      },
    ],
    notes: ["Use BODY REFERENCE bounds from the matched Stanley profile."],
  },
  calculation: {
    shapeType: "tapered",
    templateWidthMm: 313.59,
    templateHeightMm: 216,
    diameterUsedMm: 99.82,
    averageDiameterMm: 99.82,
  },
  confidenceLevel: "high",
} as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
});

test("admin golden path: template detect, review, debug, and export", async ({ page }) => {
  let detectSectionHeader = "";
  let detectTraceId = "";
  let exportSectionHeader = "";
  let exportTraceId = "";

  await page.route("**/api/admin/tumbler/auto-size", async (route) => {
    const headers = route.request().headers();
    detectSectionHeader = headers["x-admin-section-id"] ?? "";
    detectTraceId = headers["x-admin-trace-id"] ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STANLEY_AUTO_DETECT_RESPONSE),
    });
  });

  await page.route("**/api/admin/lightburn/preprocess-svg", async (route) => {
    const headers = route.request().headers();
    exportSectionHeader = headers["x-admin-section-id"] ?? "";
    exportTraceId = headers["x-admin-trace-id"] ?? "";
    const requestJson = route.request().postDataJSON() as { items?: Array<{ id: string; svgText: string }> };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        usedInkscape: false,
        items: (requestJson.items ?? []).map((item) => ({
          id: item.id,
          svgText: item.svgText,
          message: null,
        })),
      }),
    });
  });

  await page.goto("/admin?debug=1");

  await page.getByRole("button", { name: "Browse Products" }).click();
  await expect(page.getByRole("dialog", { name: "Select product" })).toBeVisible();
  await page.getByRole("button", { name: "Create new template" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Create new template" });
  await expect(dialog.getByRole("button", { name: /Source Action/i })).toBeVisible();
  await expect(dialog.getByText("1. Source")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Detect Review/i })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Review & Save Review/i })).toBeVisible();
  await expect(dialog.getByTestId("template-review-section")).toHaveCount(0);

  await dialog.getByRole("combobox").nth(1).selectOption("tumbler");
  await dialog.getByTestId("template-product-photo-input").setInputFiles({
    name: "stanley-reference.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  const continueToDetectButton = dialog.getByRole("button", { name: "Continue to detect" });
  if (await continueToDetectButton.isVisible().catch(() => false)) {
    await continueToDetectButton.click();
  }
  const detectSection = dialog.getByTestId("template-detect-section");
  const runAutoDetectButton = detectSection.getByRole("button", { name: "Run auto-detect" });
  await expect(runAutoDetectButton).toBeVisible();

  await runAutoDetectButton.click();
  const reviewSection = dialog.getByTestId("template-review-section");
  await expect(reviewSection).toBeVisible();
  await expect(dialog.getByText("Body bounds", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Printable band", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Exclusions", { exact: true })).toBeVisible();
  await expect(dialog.getByText("28 mm").first()).toBeVisible();
  await expect(dialog.getByText("244 mm").first()).toBeVisible();
  await expect(dialog.getByText("216 mm").first()).toBeVisible();
  await expect(page.locator("strong", { hasText: "template.review" }).first()).toBeVisible();
  await expect(page.locator("span", { hasText: "traceId" }).first()).toBeVisible();
  expect(detectSectionHeader).toBe("template.detect");
  expect(detectTraceId).not.toBe("");

  await dialog.getByRole("button", { name: "Accept detected body reference" }).click();
  await expect(dialog.getByText("accepted-body-reference")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save template" })).toBeVisible();

  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText("Stanley Quencher H2.0 40oz loaded. Place your artwork.")).toBeVisible();
  await expect(page.getByTestId("export-bundle-section").getByText("Printable band 28.00 -> 244.00")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Minimal LightBurn Bundle" }).evaluate((element) => {
      (element as HTMLButtonElement).click();
    }),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  expect(exportSectionHeader).toBe("export.bundle");
  expect(exportTraceId).not.toBe("");
});
