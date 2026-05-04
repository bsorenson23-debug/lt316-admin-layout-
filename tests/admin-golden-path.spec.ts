import { expect, test } from "@playwright/test";

import { openTemplateGallery } from "./helpers/adminOperatorFlow";
import { ensureWebGlSupport } from "./helpers/webglSupport";

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

const RTIC_URL = "https://rticoutdoors.com/Tumblers?size=20oz&color=Navy";
const RTIC_FIXTURE_IMAGE_URL = "https://fixture.local/rtic-essential-20oz-navy.png";

function buildLookupFixture(lookupInput: string) {
  return {
    lookupInput,
    resolvedUrl: RTIC_URL,
    title: "RTIC Essential Tumbler 20oz Navy",
    brand: "RTIC",
    model: "20oz Tumbler",
    capacityOz: 20,
    matchedProfileId: "rtic-20",
    profileAuthority: "exact-internal-profile",
    profileAuthorityLabel: "Exact profile",
    profileAuthorityReason: "Matched a trusted internal profile with a source model lane.",
    profileConfidence: 1,
    sourceModelAvailability: "generated-source-model",
    sourceModelAvailabilityLabel: "Generated source model",
    requiresBodyReferenceReview: false,
    glbPath: "/api/admin/models/generated/rtic-20-bodyfit-v5.glb",
    modelStatus: "verified-product-model",
    modelSourceLabel: "Generated straight tumbler source model",
    imageUrl: RTIC_FIXTURE_IMAGE_URL,
    imageUrls: [RTIC_FIXTURE_IMAGE_URL],
    fitDebug: null,
    dimensions: {
      lookupProductId: "rtic-20",
      productUrl: RTIC_URL,
      selectedVariantId: "20-oz-navy",
      selectedVariantLabel: "20 oz / Navy",
      selectedSizeOz: 20,
      selectedColorOrFinish: "Navy",
      availableVariantLabels: ["20 oz / Navy"],
      availableSizeOz: [20],
      dimensionSourceUrl: RTIC_URL,
      dimensionSourceText: "Matched internal profile RTIC 20oz Tumbler",
      dimensionSourceSizeOz: 20,
      dimensionSourceKind: "internal-profile",
      titleSizeOz: 20,
      confidence: 1,
      dimensionAuthority: "diameter-primary",
      diameterMm: 93,
      bodyDiameterMm: 93,
      wrapDiameterMm: 93,
      wrapWidthMm: 292.17,
      fullProductHeightMm: 190,
      bodyHeightMm: 148,
      heightIncludesLidOrStraw: true,
      overallHeightMm: 190,
      outsideDiameterMm: 93,
      topDiameterMm: null,
      bottomDiameterMm: null,
      usableHeightMm: 148,
    },
    mode: "matched-profile",
    notes: [
      "Applied internal RTIC 20oz Tumbler profile for geometry and printable-height fallback.",
      "Official or retailer page dimensions agree with the internal profile within 1 mm.",
      "GLB fallback: /api/admin/models/generated/rtic-20-bodyfit-v5.glb.",
    ],
    sources: [
      {
        title: "RTIC official product page",
        url: RTIC_URL,
        kind: "official",
      },
    ],
  };
}

test.use({
  acceptDownloads: true,
  viewport: { width: 1600, height: 1200 },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
});

test("admin golden path: detect, review, save, and export smoke", async ({ page }, testInfo) => {
  test.setTimeout(8 * 60 * 1000);

  let detectRequestSeen = false;
  let exportPreprocessSeen = false;
  let detectSectionHeader = "";
  let detectTraceId = "";
  let exportSectionHeader = "";
  let exportTraceId = "";

  await page.route("**/api/admin/tumbler/auto-size", async (route) => {
    detectRequestSeen = true;
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
    exportPreprocessSeen = true;
    const headers = route.request().headers();
    exportSectionHeader = headers["x-admin-section-id"] ?? "";
    exportTraceId = headers["x-admin-trace-id"] ?? "";

    const requestJson = (route.request().postDataJSON() ?? {}) as {
      items?: Array<{ id: string; svgText: string }>;
    };

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

  await page.route("**/api/admin/tumbler/item-lookup", async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}") as { lookupInput?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildLookupFixture(payload.lookupInput ?? RTIC_URL)),
    });
  });

  await page.route("**/api/admin/flatbed/fetch-url", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        dataUrl: `data:image/png;base64,${PNG_1X1.toString("base64")}`,
        mimeType: "image/png",
        byteLength: PNG_1X1.byteLength,
      }),
    });
  });

  await ensureWebGlSupport(page, testInfo, "admin-golden-path");
  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });

  await openTemplateGallery(page);
  await page.getByTestId("template-gallery-create-new").click();

  await expect(page.getByTestId("template-mode-shell")).toBeVisible();
  await expect(page.getByText("Source pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Detect blocked", { exact: true })).toBeVisible();

  await page.getByPlaceholder("YETI Rambler 40oz").fill(`Golden Path ${Date.now()}`);
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({
    name: "stanley-reference.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await expect(page.getByText("Source ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Detect actionable", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Auto-detect product specs" }).click();

  await expect(page.getByText("Detected proposal:")).toBeVisible({ timeout: 120_000 });
  const lookupInput = page.getByPlaceholder(
    "https://www.academy.com/... or Stanley IceFlow 30 oz Classic Flip Straw Tumbler",
  );
  await lookupInput.fill(RTIC_URL);
  await page.getByTestId("template-create-run-lookup").click();
  await expect(page.getByText("Selected size 20 oz", { exact: true })).toBeVisible({ timeout: 120_000 });

  const acceptV1 = page.getByTestId("body-reference-v1-accept");
  await expect(acceptV1).toBeEnabled();
  await acceptV1.click();
  await expect(acceptV1).toContainText("BODY REFERENCE (v1) locked", { timeout: 60_000 });

  await page.getByTestId("template-create-save").click();
  await expect(page.getByTestId("template-mode-shell")).toHaveCount(0);
  await expect(page.getByTestId("selected-template-change-button")).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Minimal LightBurn Bundle" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  expect(detectRequestSeen).toBe(true);
  expect(exportPreprocessSeen).toBe(true);
});
