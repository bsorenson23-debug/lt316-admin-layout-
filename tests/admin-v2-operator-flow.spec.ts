import fs from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  clickAndReadJsonResponse,
  openTemplateGallery,
  readMetricMap,
  readOverlaySummaryState,
  readSavedTemplate,
  waitForLocatorDisabledState,
  waitForLocatorEnabled,
  waitForLocatorText,
  waitForTextGone,
  waitForViewerOverlayState,
} from "./helpers/adminOperatorFlow";
import { getOperatorProductImageUpload, getWrapArtworkFixturePath } from "./helpers/adminOperatorFixtures";
import { buildProgrammaticBodyContractDebugReport } from "./helpers/bodyContractDebugReport";
import { ensureWebGlSupport } from "./helpers/webglSupport";

test.use({
  acceptDownloads: true,
  viewport: { width: 1600, height: 1200 },
});

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

type StoredTemplate = {
  artworkPlacements?: Array<{
    xMm?: number;
    yMm?: number;
    widthMm?: number;
    heightMm?: number;
    rotationDeg?: number;
    mappingSignature?: string | null;
  }>;
  acceptedBodyReferenceV2Draft?: {
    centerline?: unknown;
    layers?: unknown[];
  } | null;
  engravingPreviewState?: {
    mappingSignature?: string | null;
    freshness?: string | null;
    readyForPreview?: boolean;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function expectNormalBodyContractDebugReport(report: Record<string, unknown>): void {
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
  expect(summary.validationStatus).toBe("pass");
  expect(source.type).toBe("approved-svg");
  expect(runtimeInspection.status).toBe("complete");
  expect(asStringArray(meshes.bodyMeshNames)).toContain("body_mesh");
  expect(dimensions.bodyBounds).toBeTruthy();
  expect(meshes.fallbackDetected).toBe(false);
  expect(asStringArray(meshes.accessoryMeshNames)).toEqual([]);
  expect(source.hash).toBe(glb.sourceHash);
  expect(glb.freshRelativeToSource).toBe(true);
  expect(validation.status).toBe("pass");
  expect(svgQuality.status).toBe("pass");
  expect(svgQuality.suspiciousJumpCount).toBe(0);
  expect(svgQuality.expectedBridgeSegmentCount).toBe(2);
}

function expectV2BodyContractDebugReport(report: Record<string, unknown>): void {
  const summary = asRecord(report.summary);
  const contract = asRecord(report.contract);
  const source = asRecord(contract.source);
  const glb = asRecord(contract.glb);
  const meshes = asRecord(contract.meshes);
  const validation = asRecord(contract.validation);
  const auditArtifact = asRecord(report.auditArtifact);
  const auditSource = asRecord(auditArtifact.source);

  expect(summary.mode).toBe("body-cutout-qa");
  expect(summary.validationStatus).toBe("pass");
  expect(source.type).toBe("body-reference-v2");
  expect(source.centerlineCaptured).toBe(true);
  expect(source.leftBodyOutlineCaptured).toBe(true);
  expect(source.mirroredBodyGenerated).toBe(true);
  expect(asStringArray(meshes.bodyMeshNames)).toEqual(["body_mesh"]);
  expect(asStringArray(meshes.accessoryMeshNames)).toEqual([]);
  expect(glb.freshRelativeToSource).toBe(true);
  expect(source.hash).toBe(glb.sourceHash);
  expect(validation.status).toBe("pass");
  expect(asStringArray(auditSource.nonBodyGenerationExclusions)).toEqual([
    "artwork-placements",
    "engraving-overlay-preview",
    "product-appearance-layers",
  ]);
}

async function waitForCreateFlowToReturnToWorkspace(page: Page): Promise<void> {
  const createTemplateButton = page.getByTestId("template-gallery-create-new");
  const browseProductsButton = page.getByTestId("browse-products-button");
  const selectedTemplateChangeButton = page.getByTestId("selected-template-change-button");
  const uploadSvgButton = page.getByRole("button", { name: /\+ Upload SVG|Upload SVG/ });
  const modalCloseButton = page.locator('[class*="modalCloseBtn"]').first();
  const startedAt = Date.now();

  while (Date.now() - startedAt < 60_000) {
    if (
      await uploadSvgButton.isVisible().catch(() => false) ||
      await browseProductsButton.isVisible().catch(() => false) ||
      await selectedTemplateChangeButton.isVisible().catch(() => false)
    ) {
      return;
    }
    if (await createTemplateButton.isVisible().catch(() => false)) {
      if (await modalCloseButton.isVisible().catch(() => false)) {
        await modalCloseButton.click();
      }
    }
    await page.waitForTimeout(250);
  }

  throw new Error("Timed out waiting for template create flow to return to the workspace.");
}

test("BODY REFERENCE v2 operator flow stays covered through QA, wrap/export, and persistence", async ({
  page,
}, testInfo) => {
  test.setTimeout(12 * 60 * 1000);

  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("__codex_admin_v2_operator_reset__")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("__codex_admin_v2_operator_reset__", "1");
    }
  });
  await ensureWebGlSupport(page, testInfo, "admin-v2-operator-flow");

  const templateName = `Codex Playwright V2 ${Date.now()}`;
  const productImage = getOperatorProductImageUpload();

  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });

  await test.step("create a new template and verify source/detect gating", async () => {
    await expect(page.getByTestId("browse-products-button")).toBeVisible();
    await openTemplateGallery(page);
    await page.getByTestId("template-gallery-create-new").click();

    await expect(page.getByText("Source pending", { exact: true })).toBeVisible();
    await expect(page.getByText("Detect blocked", { exact: true })).toBeVisible();

    const lookupInput = page.getByPlaceholder(
      "https://www.academy.com/... or Stanley IceFlow 30 oz Classic Flip Straw Tumbler",
    );
    await lookupInput.fill("YETI Rambler 40 oz");
    await page.getByTestId("template-create-run-lookup").click();

    await expect(page.getByText("Selected size 40 oz", { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Authority Diameter primary", { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(
      page.getByText(
        "Full product height is stored for context and ignored for lookup-based body contour scale.",
        { exact: true },
      ).first(),
    ).toBeVisible({ timeout: 120_000 });

    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(productImage);
    await expect(page.getByText("Source ready", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Detect actionable", { exact: true })).toBeVisible();
    await waitForTextGone(page, "Upload a product image in Source before photo auto-detect.");

    await page.getByPlaceholder("YETI Rambler 40oz").fill(templateName);
  });

  const fineTuneMetricLabels = ["Reviewed GLB freshness", "Source hash", "GLB source hash"];
  const fineTunePanel = page.locator('[data-body-reference-fine-tune-panel="present"]');
  const fineTuneLifecycle = page.getByTestId("body-reference-fine-tune-lifecycle");

  await test.step("accept BODY REFERENCE v1 and generate reviewed BODY CUTOUT QA", async () => {
    const acceptV1Button = page.getByTestId("body-reference-v1-accept");
    await waitForLocatorEnabled(acceptV1Button, 120_000);
    await acceptV1Button.click();
    await expect(acceptV1Button).toContainText("BODY REFERENCE (v1) locked", { timeout: 60_000 });

    const generateV1Button = page.getByTestId("body-reference-v1-generate");
    const initialGeneratedPayload = await clickAndReadJsonResponse<GeneratedBodyReferenceResponse>(
      page,
      async () => {
        await (await waitForLocatorEnabled(generateV1Button, 120_000)).click();
      },
      "/api/admin/tumbler/generate-body-reference-glb",
      120_000,
    );
    expect(initialGeneratedPayload.bodyGeometryContract?.source?.type).toBe("approved-svg");

    const bodyCutoutQaButton = page.getByTestId("preview-mode-body-cutout-qa");
    await waitForLocatorEnabled(bodyCutoutQaButton, 120_000);
    await bodyCutoutQaButton.click();
    await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("BODY CUTOUT QA", {
      timeout: 120_000,
    });
    await expect(page.getByTestId("body-geometry-status-badge-status")).toHaveText("PASS");
    await expect(fineTuneLifecycle).toContainText("Reviewed GLB fresh");
    await expect(fineTuneLifecycle).toContainText("Reviewed GLB is fresh relative to accepted cutout.");

    const normalReport = await buildProgrammaticBodyContractDebugReport(
      initialGeneratedPayload,
      testInfo.outputPath("normal-body-contract-debug-report.json"),
      page.url(),
    );
    expectNormalBodyContractDebugReport(normalReport);
  });

  let sourceHashBeforeAccept = "";
  let overlaySummaryBeforeSave = { enabled: "no", count: 0, firstAngle: "", firstBodyY: "" };

  await test.step("fine tune the contour, force stale lineage, and regenerate to fresh", async () => {
    await expect(page.getByTestId("body-reference-guides-panel")).toBeVisible();
    await expect(page.getByTestId("body-reference-guides-panel")).toContainText("UI-only guide overlay");
    await expect(page.getByTestId("body-reference-guides-ui-only-note")).toContainText(
      "Does not affect approved SVG or BODY CUTOUT QA GLB",
    );
    await expect(page.getByTestId("body-reference-guides-source-hash-note")).toContainText(
      "excluded from source hash, GLB input, WRAP / EXPORT, and v2 authority",
    );
    await expect(page.getByTestId("body-reference-guide-overlay")).toBeVisible();
    await expect(page.getByTestId("body-reference-guide-top-bridge")).toHaveCount(1);
    await expect(page.getByTestId("body-reference-guide-bottom-bridge")).toHaveCount(1);
    await expect(page.getByTestId("body-reference-guide-centerline")).toHaveCount(1);

    const fineTuneBeforeGuideToggle = await readMetricMap(fineTunePanel, fineTuneMetricLabels);
    await page.getByTestId("body-reference-guides-toggle").click();
    await expect(page.getByTestId("body-reference-guide-overlay")).toBeHidden();
    await page.getByTestId("body-reference-guides-toggle").click();
    await expect(page.getByTestId("body-reference-guide-overlay")).toBeVisible();
    const fineTuneAfterGuideToggle = await readMetricMap(fineTunePanel, fineTuneMetricLabels);
    expect(fineTuneAfterGuideToggle["Reviewed GLB freshness"]).toBe(fineTuneBeforeGuideToggle["Reviewed GLB freshness"]);
    expect(fineTuneAfterGuideToggle["Source hash"]).toBe(fineTuneBeforeGuideToggle["Source hash"]);
    expect(fineTuneAfterGuideToggle["GLB source hash"]).toBe(fineTuneBeforeGuideToggle["GLB source hash"]);
    expect(fineTuneAfterGuideToggle["Reviewed GLB freshness"]).toBe("Reviewed GLB fresh");
    await expect(page.getByTestId("body-reference-fine-tune-accept")).toBeDisabled();

    await page.getByTestId("body-reference-fine-tune-edit").click();
    await page.locator('svg[aria-label="BODY REFERENCE cutout fine-tune editor"]').waitFor({
      state: "visible",
      timeout: 30_000,
    });

    const fineTuneBefore = await readMetricMap(fineTunePanel, fineTuneMetricLabels);
    sourceHashBeforeAccept = fineTuneBefore["Source hash"] ?? "";

    const editorCircles = page.locator('svg[aria-label="BODY REFERENCE cutout fine-tune editor"] circle');
    const circleCount = await editorCircles.count();
    expect(circleCount).toBeGreaterThan(0);
    const editablePointIndex = Math.max(0, circleCount - 4);
    await editorCircles.nth(editablePointIndex).click({ force: true });
    await page.locator('[data-body-reference-fine-tune-editor="present"]').focus();
    await page.locator('[data-body-reference-fine-tune-editor="present"]').press("Shift+ArrowRight");
    await page.waitForTimeout(500);

    const fineTuneDraft = await readMetricMap(fineTunePanel, fineTuneMetricLabels);
    expect(fineTuneDraft["Reviewed GLB freshness"]).toBe("Draft pending");
    expect(fineTuneDraft["Source hash"]).toBe(sourceHashBeforeAccept);
    await expect(fineTuneLifecycle).toContainText("Draft pending");
    await expect(fineTuneLifecycle).toContainText("Editing draft only - current BODY CUTOUT QA GLB is unchanged.");
    await expect(fineTuneLifecycle).toContainText("Accepting this cutout will mark the reviewed GLB stale.");

    const acceptCorrectedButton = page.getByTestId("body-reference-fine-tune-accept");
    await (await waitForLocatorEnabled(acceptCorrectedButton)).click();
    await page.waitForTimeout(500);

    const fineTuneAccepted = await readMetricMap(fineTunePanel, fineTuneMetricLabels);
    expect(fineTuneAccepted["Reviewed GLB freshness"]).toBe("Reviewed GLB stale");
    expect(fineTuneAccepted["Source hash"]).toBeDefined();
    expect(fineTuneAccepted["GLB source hash"]).toBeDefined();
    expect(fineTuneAccepted["Source hash"]).not.toBe(fineTuneAccepted["GLB source hash"]);
    await expect(fineTuneLifecycle).toContainText("Corrected cutout accepted. Regenerate BODY CUTOUT QA GLB.");
    await expect(fineTuneLifecycle).toContainText("Reviewed GLB is stale relative to accepted cutout.");
    await expect(fineTunePanel).toContainText("Accept corrected cutout: Replace accepted cutout and mark reviewed GLB stale.");
    await expect(fineTunePanel).toContainText("Reset draft: Reset draft to accepted cutout.");
    await expect(fineTunePanel).toContainText("Cancel draft: Discard draft edits and keep the accepted cutout.");

    await page.getByTestId("preview-mode-body-cutout-qa").click();
    await expect(page.getByTestId("body-geometry-status-badge-glb")).toContainText("Stale");

    const regenerateButton = page.getByTestId("body-reference-fine-tune-regenerate");
    const regeneratedPayload = await clickAndReadJsonResponse<GeneratedBodyReferenceResponse>(
      page,
      async () => {
        await (await waitForLocatorEnabled(regenerateButton, 120_000)).click();
      },
      "/api/admin/tumbler/generate-body-reference-glb",
      120_000,
    );
    expect(regeneratedPayload.bodyGeometryContract?.source?.type).toBe("approved-svg");

    await page.getByTestId("preview-mode-body-cutout-qa").click();
    const fineTuneRegenerated = await readMetricMap(fineTunePanel, fineTuneMetricLabels);
    expect(fineTuneRegenerated["Reviewed GLB freshness"]).toBe("Reviewed GLB fresh");
    await expect(fineTuneLifecycle).toContainText("Reviewed GLB fresh");
    await expect(fineTuneLifecycle).toContainText("Reviewed GLB is fresh relative to accepted cutout.");
    await expect(page.getByTestId("body-geometry-status-badge-status")).toHaveText("PASS");
  });

  await test.step("verify wrap/export separation before saved artwork exists", async () => {
    await page.getByTestId("preview-mode-wrap-export").click();
    await expect(page.getByText("WRAP / EXPORT PREVIEW", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("appearance-reference-summary")).toContainText("reference-only");
    await expect(page.getByTestId("wrap-export-summary")).toContainText(
      "Saved laser-bed millimeter placement is the WRAP / EXPORT source of truth.",
    );
    await expect(
      page.getByText(
        "No saved laser-bed artwork placements yet. Save artwork in millimeter space to unlock WRAP / EXPORT preview and export agreement checks.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByTestId("body-geometry-status-badge-note")).toContainText("Separate from BODY CUTOUT QA");

    const emptyOverlaySummary = await readOverlaySummaryState(page);
    expect(emptyOverlaySummary.enabled).toBe("no");
    expect(emptyOverlaySummary.count).toBe(0);
  });

  await test.step("verify v2 gating and generate BODY CUTOUT QA from the accepted mirrored profile", async () => {
    await page.getByTestId("preview-mode-body-cutout-qa").click();

    const bodyReferenceV2Summary = page.getByTestId("body-reference-v2-summary");
    const bodyReferenceV2MirrorPreview = page.getByTestId("body-reference-v2-mirror-preview");
    const bodyReferenceV2GenerationReadiness = page.getByTestId("body-reference-v2-generation-readiness");
    const v2GenerateButton = page.getByTestId("body-reference-v2-generate");

    await expect(bodyReferenceV2Summary).toBeVisible();
    await expect(bodyReferenceV2MirrorPreview).toBeVisible();
    await expect(bodyReferenceV2GenerationReadiness).toBeVisible();
    await expect(page.getByTestId("body-reference-v2-seed-centerline")).toBeVisible();
    await expect(page.getByTestId("body-reference-v2-seed-body-left")).toBeVisible();
    await expect(page.getByTestId("body-reference-v2-accept-draft")).toBeVisible();
    await expect(page.getByTestId("body-reference-v2-reset-draft")).toBeVisible();

    const preCaptureSummaryText = (await bodyReferenceV2Summary.textContent()) ?? "";
    const preCaptureMirrorText = (await bodyReferenceV2MirrorPreview.textContent()) ?? "";
    const preCaptureGenerationText = (await bodyReferenceV2GenerationReadiness.textContent()) ?? "";
    expect(preCaptureSummaryText).toContain("Accepted v2 draft");
    expect(preCaptureSummaryText).toContain("no");
    expect(
      preCaptureMirrorText.includes("Capture the centerline axis.") ||
        preCaptureMirrorText.includes("Centerline axismissing"),
    ).toBe(true);
    expect(
      preCaptureGenerationText.includes("Accept v2 draft") ||
        preCaptureGenerationText.includes("Capture the centerline axis."),
    ).toBe(true);
    await waitForLocatorDisabledState(v2GenerateButton, true, 30_000);

    await page.getByTestId("body-reference-v2-seed-centerline").click();
    await page.getByTestId("body-reference-v2-seed-body-left").click();
    await page.waitForTimeout(500);

    const seededSummaryText = await waitForLocatorText(
      bodyReferenceV2Summary,
      (text) => text.includes("Centerline axiscaptured") && text.includes("Body-left outlinecaptured"),
      30_000,
    );
    const seededMirrorText = await waitForLocatorText(
      bodyReferenceV2MirrorPreview,
      (text) => text.includes("Body-left points") && text.includes("Mirrored-right points"),
      30_000,
    );
    expect(seededSummaryText).toContain("captured");
    expect(seededMirrorText).toContain("Mirrored-right points");
    await waitForLocatorDisabledState(v2GenerateButton, true, 30_000);

    await page.getByTestId("body-reference-v2-accept-draft").click();
    await page.waitForTimeout(500);

    const acceptedSummaryText = await waitForLocatorText(
      bodyReferenceV2Summary,
      (text) =>
        text.includes("Accepted v2 draftyes") &&
        text.includes("Draft pending acceptanceno") &&
        text.includes("v2 generation readyyes"),
      60_000,
    );
    const acceptedGenerationText = await waitForLocatorText(
      bodyReferenceV2GenerationReadiness,
      (text) => text.includes("Accepted draftyes") && text.includes("Accepted draft readyyes"),
      60_000,
    );
    expect(acceptedSummaryText).toContain("Current QA sourcev1 approved contour");
    expect(acceptedGenerationText).toContain("Accepted draft readyyes");

    const v2GeneratedPayload = await clickAndReadJsonResponse<GeneratedBodyReferenceResponse>(
      page,
      async () => {
        await (await waitForLocatorEnabled(v2GenerateButton, 120_000)).click();
      },
      "/api/admin/tumbler/generate-body-reference-glb",
      120_000,
    );
    expect(v2GeneratedPayload.bodyGeometryContract?.source?.type).toBe("body-reference-v2");

    await page.getByTestId("preview-mode-body-cutout-qa").click();
    await waitForLocatorText(
      bodyReferenceV2GenerationReadiness,
      (text) => text.includes("Current source authority: BODY REFERENCE v2 mirrored profile."),
      120_000,
    );
    await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("BODY CUTOUT QA");
    await expect(page.getByTestId("body-geometry-status-badge-status")).toHaveText("PASS");

    const v2Report = await buildProgrammaticBodyContractDebugReport(
      v2GeneratedPayload,
      testInfo.outputPath("v2-body-contract-debug-report.json"),
      page.url(),
    );
    expectV2BodyContractDebugReport(v2Report);
  });

  await test.step("save the template, add artwork, and verify wrap/export persistence", async () => {
    await page.getByTestId("template-create-save").scrollIntoViewIfNeeded();
    await page.getByTestId("template-create-save").click();
    await waitForCreateFlowToReturnToWorkspace(page);

    const savedTemplateAfterCreate = (await readSavedTemplate(page, templateName)) as StoredTemplate | null;
    expect(savedTemplateAfterCreate).toBeTruthy();
    expect(savedTemplateAfterCreate?.acceptedBodyReferenceV2Draft?.centerline).toBeTruthy();
    expect(Array.isArray(savedTemplateAfterCreate?.acceptedBodyReferenceV2Draft?.layers)).toBe(true);

    const wrapArtworkSvgText = await fs.readFile(getWrapArtworkFixturePath(), "utf8");
    await page.evaluate(
      ({ storedTemplateName, svgText }) => {
        const parsed = JSON.parse(window.localStorage.getItem("lt316_product_templates") ?? "[]");
        const store =
          Array.isArray(parsed)
            ? { templates: parsed }
            : (parsed && typeof parsed === "object" && Array.isArray((parsed as { templates?: unknown[] }).templates)
              ? parsed
              : { templates: [] });

        const templates = Array.isArray((store as { templates?: unknown[] }).templates)
          ? (store as { templates: Array<Record<string, unknown>> }).templates
          : [];
        const template = templates.find((entry) => entry?.name === storedTemplateName);
        if (!template) {
          throw new Error(`Template not found in localStorage: ${storedTemplateName}`);
        }

        template.artworkPlacements = [{
          id: "seeded-wrap-artwork",
          assetId: "seeded-wrap-artwork",
          name: "wrap-test.svg",
          xMm: 24,
          yMm: 40,
          widthMm: 80,
          heightMm: 48.97,
          rotationDeg: 0,
          visible: true,
          assetSnapshot: {
            svgText,
            sourceSvgText: svgText,
            documentBounds: { x: 0, y: 0, width: 285.88, height: 175 },
            artworkBounds: { x: 0, y: 0, width: 285.88, height: 175 },
          },
        }];

        window.localStorage.setItem("lt316_product_templates", JSON.stringify(store));
      },
      { storedTemplateName: templateName, svgText: wrapArtworkSvgText },
    );

    const storedTemplateWithPlacement = (await readSavedTemplate(page, templateName)) as StoredTemplate | null;
    expect(storedTemplateWithPlacement?.artworkPlacements?.length ?? 0).toBeGreaterThanOrEqual(1);

    await page.reload({ waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(1_000);
    await openTemplateGallery(page);
    await expect(page.getByTestId("template-gallery-manage-button")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("template-gallery-manage-button").click({ timeout: 30_000 });
    await expect(page.getByLabel(`Edit ${templateName}`, { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel(`Edit ${templateName}`, { exact: true }).click({ timeout: 30_000 });

    const persistedV2SummaryMetrics = await readMetricMap(page.getByTestId("body-reference-v2-summary"), [
      "Accepted v2 draft",
      "Draft pending acceptance",
      "v2 generation ready",
      "Current QA source",
    ]);
    expect(persistedV2SummaryMetrics["Accepted v2 draft"]).toBe("yes");
    expect(persistedV2SummaryMetrics["Draft pending acceptance"]).toBe("no");
    expect(persistedV2SummaryMetrics["v2 generation ready"]).toBe("yes");

    await page.getByTestId("preview-mode-wrap-export").click();
    await expect(page.getByText("Saved artwork placements", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("appearance-reference-summary")).toContainText("reference-only");

    const wrapLabels = [
      "Saved artwork placements",
      "Saved placement agreement",
      "Saved mapping signature",
      "Overlay enabled",
      "Overlay material",
    ];
    const wrapMetricsBeforeRegenerate = await readMetricMap(page.locator("body"), wrapLabels);
    expect(Number.parseInt(wrapMetricsBeforeRegenerate["Saved artwork placements"] ?? "0", 10)).toBeGreaterThanOrEqual(1);
    expect(wrapMetricsBeforeRegenerate["Overlay enabled"]).toBe("no");

    const reopenedFineTuneMetrics = await readMetricMap(fineTunePanel, fineTuneMetricLabels);
    expect(reopenedFineTuneMetrics["Reviewed GLB freshness"]).toContain("stale");

    await page.getByTestId("preview-mode-body-cutout-qa").click();
    const regeneratedPersistedV2Payload = await clickAndReadJsonResponse<GeneratedBodyReferenceResponse>(
      page,
      async () => {
        await (await waitForLocatorEnabled(page.getByTestId("body-reference-v2-generate"), 120_000)).click();
      },
      "/api/admin/tumbler/generate-body-reference-glb",
      120_000,
    );
    expect(regeneratedPersistedV2Payload.bodyGeometryContract?.source?.type).toBe("body-reference-v2");

    await page.getByTestId("preview-mode-wrap-export").click();
    await expect(page.getByText("Saved artwork placements", { exact: true })).toBeVisible({ timeout: 30_000 });

    const wrapMetricsAfterRegenerate = await readMetricMap(page.locator("body"), wrapLabels);
    expect(Number.parseInt(wrapMetricsAfterRegenerate["Saved artwork placements"] ?? "0", 10)).toBeGreaterThanOrEqual(1);
    expect(wrapMetricsAfterRegenerate["Overlay enabled"]).toBe("yes");
    expect(wrapMetricsAfterRegenerate["Overlay material"]).toBe("engraving-preview-silver");

    overlaySummaryBeforeSave = await readOverlaySummaryState(page);
    expect(overlaySummaryBeforeSave.enabled).toBe("yes");
    expect(overlaySummaryBeforeSave.count).toBeGreaterThanOrEqual(1);

    const viewerOverlayInWrapExport = await waitForViewerOverlayState(page, "wrap-export", "present", 30_000);
    expect(viewerOverlayInWrapExport.presence).toBe("present");

    await page.getByTestId("preview-mode-body-cutout-qa").click();
    const viewerOverlayInBodyQa = await waitForViewerOverlayState(page, "body-cutout-qa", "absent", 30_000);
    expect(viewerOverlayInBodyQa.presence).toBe("absent");

    await page.reload({ waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(1_000);
    await openTemplateGallery(page);
    await expect(page.getByTestId("template-gallery-manage-button")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("template-gallery-manage-button").click({ timeout: 30_000 });
    await expect(page.getByLabel(`Edit ${templateName}`, { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel(`Edit ${templateName}`, { exact: true }).click({ timeout: 30_000 });

    await waitForLocatorText(
      page.getByTestId("body-reference-v2-summary"),
      (text) => text.includes("Accepted v2 draftyes"),
      30_000,
    );
    await page.getByTestId("preview-mode-wrap-export").click();
    await expect(page.getByText("Saved artwork placements", { exact: true })).toBeVisible({ timeout: 30_000 });

    const wrapMetricsAfterReload = await readMetricMap(page.locator("body"), wrapLabels);
    expect(Number.parseInt(wrapMetricsAfterReload["Saved artwork placements"] ?? "0", 10)).toBeGreaterThanOrEqual(1);

    const savedTemplateAfterReload = (await readSavedTemplate(page, templateName)) as StoredTemplate | null;
    expect(savedTemplateAfterReload).toBeTruthy();
    expect(savedTemplateAfterReload?.acceptedBodyReferenceV2Draft).toBeTruthy();
    expect(savedTemplateAfterReload?.artworkPlacements?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});
