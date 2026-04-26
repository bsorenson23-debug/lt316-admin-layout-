import { expect, test, type Page } from "@playwright/test";

import {
  clickAndReadJsonResponse,
  downloadBodyContractDebugReport,
  openBodyContractInspector,
  openTemplateGallery,
  waitForLocatorEnabled,
  waitForTextGone,
} from "./helpers/adminOperatorFlow";
import { getOperatorProductImageUpload } from "./helpers/adminOperatorFixtures";
import { ensureWebGlSupport } from "./helpers/webglSupport";

const STANLEY_ICEFLO_URL =
  "https://www.stanley1913.com/products/the-iceflow-flip-straw-tumbler-30-oz?variant=53973995716968";
const STANLEY_FIXTURE_IMAGE_URL = "https://fixture.local/stanley-iceflow-daffodil.png";

type GeneratedBodyReferenceResponse = {
  glbPath?: string;
  auditJsonPath?: string;
  bodyGeometryContract?: {
    source?: {
      type?: string;
      hash?: string;
    };
    glb?: {
      sourceHash?: string;
      freshRelativeToSource?: boolean;
    };
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function expectBodyCutoutQaDebugReport(report: Record<string, unknown>): void {
  const summary = asRecord(report.summary);
  const contract = asRecord(report.contract);
  const source = asRecord(contract.source);
  const glb = asRecord(contract.glb);
  const meshes = asRecord(contract.meshes);
  const dimensions = asRecord(contract.dimensionsMm);
  const runtimeInspection = asRecord(contract.runtimeInspection);
  const validation = asRecord(contract.validation);
  const svgQuality = asRecord(contract.svgQuality);

  expect(summary.mode).toBe("body-cutout-qa");
  expect(source.type).toBe("approved-svg");
  expect(runtimeInspection.status).toBe("complete");
  expect(asStringArray(meshes.bodyMeshNames)).toEqual(["body_mesh"]);
  expect(dimensions.bodyBounds).toBeTruthy();
  expect(meshes.fallbackDetected).toBe(false);
  expect(asStringArray(meshes.accessoryMeshNames)).toEqual([]);
  expect(source.hash).toBeTruthy();
  expect(source.hash).toBe(glb.sourceHash);
  expect(glb.freshRelativeToSource).toBe(true);
  expect(validation.status).toBe("pass");
  expect(svgQuality.status).toBe("pass");
  expect(svgQuality.suspiciousJumpCount).toBe(0);
  expect(svgQuality.expectedBridgeSegmentCount).toBe(2);
}

function buildStanleyLookupFixture(lookupInput: string) {
  const measurementBandWidthPx = 88.9;
  const rightBodyProfile = [
    { x: 44.5, y: 15 },
    { x: 44.5, y: 25 },
    { x: 44.5, y: 32.4 },
    { x: 43.9, y: 40.2 },
    { x: 43.9, y: 47.6 },
    { x: 43.9, y: 55 },
    { x: 43.9, y: 62.9 },
    { x: 43.9, y: 70.2 },
    { x: 43.9, y: 77.6 },
    { x: 43.9, y: 85 },
    { x: 43.9, y: 92.9 },
    { x: 43.9, y: 100.2 },
    { x: 43.9, y: 107.6 },
    { x: 43.9, y: 115.5 },
    { x: 43.9, y: 122.8 },
    { x: 43.9, y: 130.2 },
    { x: 43.9, y: 138.1 },
    { x: 42.2, y: 145.5 },
    { x: 40.3, y: 152.8 },
    { x: 38.7, y: 160.7 },
    { x: 38.1, y: 168.1 },
    { x: 37.6, y: 175.4 },
    { x: 37.1, y: 183.3 },
    { x: 36.6, y: 190.7 },
    { x: 36, y: 198.1 },
    { x: 35.5, y: 205.4 },
    { x: 35.3, y: 213.3 },
    { x: 35, y: 220.7 },
    { x: 34.5, y: 228 },
    { x: 32, y: 235.9 },
    { x: 15.7, y: 243.3 },
  ];
  const profilePoints = rightBodyProfile.map((point) => ({
    yPx: point.y,
    yMm: point.y,
    radiusPx: point.x,
    radiusMm: point.x,
  }));

  return {
    lookupInput,
    resolvedUrl: STANLEY_ICEFLO_URL,
    title: "The IceFlow Flip Straw Tumbler | 30 OZ | Insulated Water Bottle",
    brand: "Stanley",
    model: "IceFlow Flip Straw 30oz",
    capacityOz: 30,
    matchedProfileId: "stanley-iceflow-30",
    glbPath: "/api/admin/models/generated/stanley-iceflow-30-bodyfit-v5.glb",
    modelStatus: "verified-product-model",
    modelSourceLabel: "profile-driven auto-generator",
    imageUrl: STANLEY_FIXTURE_IMAGE_URL,
    imageUrls: [STANLEY_FIXTURE_IMAGE_URL],
    fitDebug: {
      kind: "lathe-body-fit",
      sourceImageUrl: STANLEY_FIXTURE_IMAGE_URL,
      imageWidthPx: 600,
      imageHeightPx: 600,
      silhouetteBoundsPx: { minX: 255.5, minY: 15, maxX: 344.5, maxY: 243.3 },
      centerXPx: 300,
      fullTopPx: 15,
      fullBottomPx: 243.3,
      bodyTopPx: 15,
      bodyBottomPx: 243.3,
      paintedBodyTopPx: 25,
      colorBodyBottomPx: 243.3,
      bodyTraceTopPx: 15,
      bodyTraceBottomPx: 243.3,
      engravingStartGuidePx: 15,
      seamSilverBottomPx: 15,
      rimTopPx: 0,
      rimBottomPx: 15,
      referenceBandTopPx: 25,
      referenceBandBottomPx: 39,
      referenceBandCenterYPx: 32,
      referenceBandWidthPx: measurementBandWidthPx,
      measurementBandTopPx: 25,
      measurementBandBottomPx: 39,
      measurementBandCenterYPx: 32,
      measurementBandCenterXPx: 300,
      measurementBandWidthPx,
      measurementBandLeftPx: 255.55,
      measurementBandRightPx: 344.45,
      measurementBandRowCount: 15,
      measurementBandWidthStdDevPx: 0.3,
      maxCenterWidthPx: 88.9,
      referenceHalfWidthPx: measurementBandWidthPx / 2,
      handleSide: null,
      handleCenterYPx: null,
      handleOuterWidthPx: null,
      handleOuterHeightPx: null,
      handleAttachEdgePx: null,
      handleOuterEdgePx: null,
      handleHoleTopPx: null,
      handleHoleBottomPx: null,
      handleBarWidthPx: null,
      fitScore: 0.92,
      profilePoints,
    },
    dimensions: {
      lookupProductId: "stanley-iceflow-30",
      productUrl: STANLEY_ICEFLO_URL,
      selectedVariantId: "53973995716968",
      selectedVariantLabel: "30 oz / Daffodil",
      selectedSizeOz: 30,
      selectedColorOrFinish: "Daffodil",
      availableVariantLabels: ["30 oz / Daffodil"],
      availableSizeOz: [30],
      dimensionSourceUrl: STANLEY_ICEFLO_URL,
      dimensionSourceText: "Matched internal profile Stanley IceFlow 30oz",
      dimensionSourceSizeOz: 30,
      titleSizeOz: 30,
      confidence: 1,
      dimensionAuthority: "diameter-primary",
      diameterMm: 88.9,
      bodyDiameterMm: 88.9,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      fullProductHeightMm: 218.4,
      bodyHeightMm: 150,
      heightIncludesLidOrStraw: true,
      overallHeightMm: 218.4,
      outsideDiameterMm: null,
      topDiameterMm: 88.9,
      bottomDiameterMm: 76.2,
      usableHeightMm: 150,
    },
    mode: "matched-profile",
    notes: [
      "Applied internal Stanley IceFlow 30oz profile for geometry and printable-height fallback.",
      "Top margin fallback: 25 mm. Bottom margin fallback: 43.4 mm.",
      "Handle arc fallback: 0°.",
      "GLB fallback: /api/admin/models/generated/stanley-iceflow-30-bodyfit-v5.glb.",
    ],
    sources: [
      {
        label: "Stanley official product page",
        url: STANLEY_ICEFLO_URL,
        kind: "official",
      },
    ],
  };
}

async function installDeterministicStanleyLookup(page: Page): Promise<void> {
  const productImage = getOperatorProductImageUpload();
  const dataUrl = `data:${productImage.mimeType};base64,${productImage.buffer.toString("base64")}`;

  await page.route("**/api/admin/tumbler/item-lookup", async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}") as { lookupInput?: string };
    expect(payload.lookupInput).toBe(STANLEY_ICEFLO_URL);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildStanleyLookupFixture(payload.lookupInput ?? STANLEY_ICEFLO_URL)),
    });
  });

  await page.route("**/api/admin/flatbed/fetch-url", async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}") as { url?: string };
    expect(payload.url).toBe(STANLEY_FIXTURE_IMAGE_URL);
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
  acceptDownloads: true,
  viewport: { width: 1600, height: 1200 },
});

test("Stanley URL lookup protects BODY REFERENCE to BODY CUTOUT QA operator flow", async ({
  page,
}, testInfo) => {
  test.setTimeout(10 * 60 * 1000);

  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  const generatedAuditResponses: Array<{ phase: "before-generation" | "after-generation"; status: number; url: string }> = [];
  let generationStarted = false;

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/admin/models/generated-audit/")) {
      generatedAuditResponses.push({
        phase: generationStarted ? "after-generation" : "before-generation",
        status: response.status(),
        url: response.url(),
      });
    }
  });

  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("__codex_admin_stanley_lookup_body_qa_reset__")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("__codex_admin_stanley_lookup_body_qa_reset__", "1");
    }
  });
  await installDeterministicStanleyLookup(page);
  await ensureWebGlSupport(page, testInfo, "admin-stanley-lookup-body-qa-flow");

  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });
  await openTemplateGallery(page);
  await page.getByTestId("template-gallery-create-new").click();

  await expect(page.getByTestId("template-mode-shell")).toBeVisible();
  await expect(page.getByText("Source pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Detect blocked", { exact: true })).toBeVisible();
  await expect(page.getByText("Upload a product photo first.", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("template-create-lookup-action-reason")).toContainText(
    "Enter a product URL or exact tumbler name first.",
  );
  await expect(page.getByTestId("body-reference-v2-summary")).toContainText(
    "BODY REFERENCE v2 optional · not active",
  );
  await expect(page.locator("body")).not.toContainText(/smart-template|vectorize|image-to-svg/i);

  const lookupInput = page.getByPlaceholder(
    "https://www.academy.com/... or Stanley IceFlow 30 oz Classic Flip Straw Tumbler",
  );
  await lookupInput.fill(STANLEY_ICEFLO_URL);
  await page.getByTestId("template-create-run-lookup").click();

  await expect(page.getByText("Source ready", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Detect actionable", { exact: true })).toBeVisible();
  await waitForTextGone(page, "Upload a product photo first.");
  await expect(page.getByText("Selected size 30 oz", { exact: true })).toBeVisible();
  await expect(page.getByText("Exact variant", { exact: true })).toBeVisible();
  await expect(page.getByTestId("body-reference-v1-accept")).toBeEnabled();
  await expect(page.getByTestId("body-reference-v1-generate")).toBeDisabled();
  const advancedLookupDebug = page
    .locator("details")
    .filter({ hasText: "Advanced debug · lookup fit and detection guides" });
  await expect(advancedLookupDebug).toBeVisible();
  expect(await advancedLookupDebug.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
  expect(generatedAuditResponses).toEqual([]);

  await (await waitForLocatorEnabled(page.getByTestId("body-reference-v1-accept"), 120_000)).click();
  await expect(page.getByText("BODY REFERENCE accepted", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main")).toContainText("BODY CUTOUT QA GLB: not generated yet");
  await expect(page.locator("main")).not.toContainText("BODY CUTOUT QA GLB: stale");
  await expect(page.getByTestId("body-reference-v1-generate")).toBeEnabled();

  generationStarted = true;
  const generatedAuditResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/admin/models/generated-audit/") && response.status() === 200,
    { timeout: 120_000 },
  );
  const generatedPayload = await clickAndReadJsonResponse<GeneratedBodyReferenceResponse>(
    page,
    async () => {
      await (await waitForLocatorEnabled(page.getByTestId("body-reference-v1-generate"), 120_000)).click();
    },
    "/api/admin/tumbler/generate-body-reference-glb",
    120_000,
  );
  expect(generatedPayload.bodyGeometryContract?.source?.type).toBe("approved-svg");
  expect(generatedPayload.bodyGeometryContract?.source?.hash).toBe(
    generatedPayload.bodyGeometryContract?.glb?.sourceHash,
  );
  expect(generatedPayload.bodyGeometryContract?.glb?.freshRelativeToSource).toBe(true);

  await (await waitForLocatorEnabled(page.getByTestId("preview-mode-body-cutout-qa"), 120_000)).click();
  const generatedAuditResponse = await generatedAuditResponsePromise;
  expect(generatedAuditResponse.status()).toBe(200);
  expect(generatedAuditResponses.filter((entry) => entry.phase === "before-generation")).toEqual([]);
  expect(generatedAuditResponses.filter((entry) => entry.status === 404)).toEqual([]);

  await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("BODY CUTOUT QA", {
    timeout: 120_000,
  });
  await expect(page.getByTestId("body-geometry-status-badge-status")).toHaveText("PASS");
  await expect(page.getByTestId("body-geometry-status-badge-fallback")).toContainText("Disabled");
  await expect(page.getByTestId("body-geometry-status-badge-glb")).toContainText("Fresh");
  await expect(page.getByTestId("body-reference-v2-summary")).toContainText(
    "BODY REFERENCE v2 optional · not active",
  );
  await expect(page.getByTestId("preview-mode-wrap-export")).toBeEnabled();
  await expect(page.locator("body")).not.toContainText(/smart-template|vectorize|image-to-svg/i);

  await openBodyContractInspector(page);
  await expect(page.getByTestId("body-contract-inspector-status")).toHaveText(/PASS/);
  await expect(page.getByTestId("body-contract-inspector-runtime-status")).toContainText("complete");
  await expect(page.getByTestId("body-contract-inspector-body-meshes")).toContainText("body_mesh");
  await expect(page.getByTestId("body-contract-inspector-accessory-meshes")).toContainText("none");
  await expect(page.getByTestId("body-contract-inspector-fallback-meshes")).toContainText("none");
  await expect(page.getByTestId("body-contract-inspector-validation-status")).toContainText("PASS");

  const debugReport = await downloadBodyContractDebugReport(
    page,
    testInfo.outputPath("stanley-lookup-body-qa-debug-report.json"),
  );
  expectBodyCutoutQaDebugReport(debugReport);

  expect(consoleErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
});
