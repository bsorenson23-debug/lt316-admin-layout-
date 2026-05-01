import { expect, test, type Page } from "@playwright/test";

import { openTemplateGallery } from "./helpers/adminOperatorFlow";
import { getOperatorProductImageUpload } from "./helpers/adminOperatorFixtures";
import { ensureWebGlSupport } from "./helpers/webglSupport";

const RTIC_URL = "https://rticoutdoors.com/Tumblers?size=20oz&color=Navy";
const RTIC_FIXTURE_IMAGE_URL = "https://fixture.local/rtic-essential-20oz-navy.png";

function buildRticLookupFixture(lookupInput: string) {
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

async function installDeterministicRticLookup(page: Page): Promise<void> {
  const productImage = getOperatorProductImageUpload();
  const dataUrl = `data:${productImage.mimeType};base64,${productImage.buffer.toString("base64")}`;

  await page.route("**/api/admin/tumbler/item-lookup", async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}") as { lookupInput?: string };
    expect(payload.lookupInput).toBe(RTIC_URL);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildRticLookupFixture(payload.lookupInput ?? RTIC_URL)),
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
