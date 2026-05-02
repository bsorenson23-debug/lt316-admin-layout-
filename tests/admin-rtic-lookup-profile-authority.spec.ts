import { expect, test, type Page } from "@playwright/test";

import { openTemplateGallery } from "./helpers/adminOperatorFlow";
import { getOperatorProductImageUpload } from "./helpers/adminOperatorFixtures";
import { ensureWebGlSupport } from "./helpers/webglSupport";

const RTIC_URL = "https://rticoutdoors.com/Tumblers?size=20oz&color=Navy";
const RTIC_FIXTURE_IMAGE_URL = "https://fixture.local/rtic-essential-20oz-navy.png";

function buildShadowInflatedRticFitDebug() {
  const mmPerSourceUnit = 93 / 378.36;
  const radiiMm = [
    46.6,
    46.3,
    46.1,
    45.8,
    45.8,
    45.6,
    45.3,
    45.1,
    44.9,
    44.9,
    44.6,
    44.1,
    43,
    41.2,
    39.1,
    37.6,
    37,
    36.7,
    36.5,
    67.4,
    78.5,
    83.7,
    84.7,
    82.2,
    76.7,
    68.6,
    58.4,
    46.9,
    28.7,
    17.1,
  ];
  const profilePoints = radiiMm.map((radiusMm, index) => {
    const yPx = 298 + ((934 - 298) * index) / Math.max(1, radiiMm.length - 1);
    return {
      yPx: Math.round(yPx * 100) / 100,
      yMm: Math.round((148 - (148 * index) / Math.max(1, radiiMm.length - 1)) * 100) / 100,
      radiusPx: Math.round((radiusMm / mmPerSourceUnit) * 100) / 100,
      radiusMm,
    };
  });

  return {
    kind: "lathe-body-fit",
    sourceImageUrl: RTIC_FIXTURE_IMAGE_URL,
    imageWidthPx: 1000,
    imageHeightPx: 1000,
    silhouetteBoundsPx: { minX: 308, minY: 58, maxX: 844, maxY: 935 },
    centerXPx: 499.5,
    fullTopPx: 58,
    fullBottomPx: 934,
    bodyTopPx: 298,
    bodyBottomPx: 934,
    paintedBodyTopPx: 298,
    colorBodyBottomPx: 934,
    bodyTraceTopPx: 298,
    bodyTraceBottomPx: 934,
    rimTopPx: 235,
    rimBottomPx: 329,
    referenceBandTopPx: 301,
    referenceBandBottomPx: 322,
    referenceBandCenterYPx: 311.5,
    referenceBandWidthPx: 378.36,
    measurementBandTopPx: 301,
    measurementBandBottomPx: 322,
    measurementBandCenterYPx: 311.5,
    measurementBandCenterXPx: 499.5,
    measurementBandWidthPx: 378.36,
    measurementBandLeftPx: 310.32,
    measurementBandRightPx: 688.68,
    measurementBandRowCount: 22,
    measurementBandWidthStdDevPx: 0.8,
    maxCenterWidthPx: 482,
    referenceHalfWidthPx: 189.18,
    fitScore: 8.39,
    profilePoints,
  };
}

function buildRticLookupFixture(
  lookupInput: string,
  options: { fitDebug?: ReturnType<typeof buildShadowInflatedRticFitDebug> | null } = {},
) {
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
    fitDebug: options.fitDebug ?? null,
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

async function installDeterministicRticLookup(
  page: Page,
  options: { fitDebug?: ReturnType<typeof buildShadowInflatedRticFitDebug> | null } = {},
): Promise<void> {
  const productImage = getOperatorProductImageUpload();
  const dataUrl = `data:${productImage.mimeType};base64,${productImage.buffer.toString("base64")}`;

  await page.route("**/api/admin/tumbler/item-lookup", async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}") as { lookupInput?: string };
    expect(payload.lookupInput).toBe(RTIC_URL);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildRticLookupFixture(payload.lookupInput ?? RTIC_URL, options)),
    });
  });

  await page.route("**/api/admin/flatbed/fetch-url", async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}") as { url?: string };
    expect(payload.url).toBe(RTIC_FIXTURE_IMAGE_URL);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        dataUrl,
        mimeType: productImage.mimeType,
        byteLength: productImage.buffer.byteLength,
      }),
    });
  });
}

test.use({
  viewport: { width: 1600, height: 1200 },
});

test("RTIC URL lookup exposes cross-brand profile authority and generated source model lane", async ({
  page,
}, testInfo) => {
  test.setTimeout(4 * 60 * 1000);

  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await installDeterministicRticLookup(page);
  await ensureWebGlSupport(page, testInfo, "admin-rtic-lookup-profile-authority");

  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });
  await openTemplateGallery(page);
  await page.getByTestId("template-gallery-create-new").click();
  await expect(page.getByTestId("template-mode-shell")).toBeVisible();

  await page
    .getByPlaceholder("https://www.academy.com/... or Stanley IceFlow 30 oz Classic Flip Straw Tumbler")
    .fill(RTIC_URL);
  await page.getByTestId("template-create-run-lookup").click();

  await expect(page.getByText("Source ready", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("lookup-profile-authority-badge")).toHaveText("Exact profile");
  await expect(page.getByText("Official source", { exact: true })).toBeVisible();
  await expect(page.getByText("Generated source model", { exact: true })).toBeVisible();
  await expect(page.getByText("RTIC / 20oz / Navy", { exact: true })).toBeVisible();
  await expect(page.getByText(/Diameter authority 93(?:\.0+)? mm/)).toBeVisible();
  await expect(page.getByText(/Wrap width 292\.17 mm = Math\.PI \* diameter/)).toBeVisible();
  await expect(page.getByText("Variant 20 oz / Navy", { exact: true })).toBeVisible();
  await expect(page.getByText("Selected size 20 oz", { exact: true })).toBeVisible();
  await expect(page.getByTestId("body-reference-v1-accept")).toBeEnabled();
  await expect(page.getByTestId("body-reference-v1-generate")).toBeDisabled();
  await expect(page.locator("body")).not.toContainText(/Stanley IceFlow|YETI Rambler 40oz/);
});

test("RTIC noisy fit keeps BODY CUTOUT QA generation blocked until contour review passes", async ({
  page,
}, testInfo) => {
  test.setTimeout(4 * 60 * 1000);

  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await installDeterministicRticLookup(page, {
    fitDebug: buildShadowInflatedRticFitDebug(),
  });
  await ensureWebGlSupport(page, testInfo, "admin-rtic-lookup-profile-authority-noisy-fit");

  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });
  await openTemplateGallery(page);
  await page.getByTestId("template-gallery-create-new").click();
  await expect(page.getByTestId("template-mode-shell")).toBeVisible();

  await page
    .getByPlaceholder("https://www.academy.com/... or Stanley IceFlow 30 oz Classic Flip Straw Tumbler")
    .fill(RTIC_URL);
  await page.getByTestId("template-create-run-lookup").click();

  await expect(page.getByText("Source ready", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("body-reference-v1-accept")).toBeEnabled();
  await page.getByTestId("body-reference-v1-accept").click();

  await expect(page.getByText(/GUIDES NEED REVIEW/i)).toBeVisible();
  await expect(page.getByText("Body-only confidence", { exact: true }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("low");
  await expect(page.getByText(/BODY CUTOUT QA generation blocked: review\/fix BODY REFERENCE contour first\./)).toBeVisible();
  await expect(page.getByTestId("body-reference-v1-generate")).toBeDisabled();
});
