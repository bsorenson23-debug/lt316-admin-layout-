import { expect, test } from "@playwright/test";

import {
  clickAndReadJsonResponse,
  openTemplateGallery,
  waitForLocatorDisabledState,
  waitForLocatorEnabled,
  waitForTextGone,
} from "./helpers/adminOperatorFlow";
import { getOperatorProductImageUpload } from "./helpers/adminOperatorFixtures";
import { ensureWebGlSupport } from "./helpers/webglSupport";

type GeneratedBodyReferenceResponse = {
  bodyGeometryContract?: {
    source?: {
      type?: string;
    };
  };
};

test.use({
  acceptDownloads: true,
  viewport: { width: 1600, height: 1200 },
});

test("disabled actions explain exactly why they are blocked during template create", async ({
  page,
}, testInfo) => {
  test.setTimeout(8 * 60 * 1000);

  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("__codex_admin_disabled_action_reasons_reset__")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("__codex_admin_disabled_action_reasons_reset__", "1");
    }
  });
  await ensureWebGlSupport(page, testInfo, "admin-disabled-action-reasons");

  const productImage = getOperatorProductImageUpload();

  await page.goto("/admin", { waitUntil: "networkidle", timeout: 120_000 });

  await openTemplateGallery(page);
  await page.getByTestId("template-gallery-create-new").click();

  await expect(page.getByText("Source pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Detect blocked", { exact: true })).toBeVisible();
  await expect(page.getByTestId("template-create-lookup-action-reason")).toContainText(
    "Enter a product URL or exact tumbler name first.",
  );
  await expect(page.getByTestId("template-create-preview-action-reasons")).toContainText(
    "BODY CUTOUT QA: Generate reviewed GLB first.",
  );
  await expect(page.getByTestId("template-create-preview-action-reasons")).toContainText(
    "WRAP / EXPORT, Full model, and Source compare: Load or generate a model first.",
  );
  await expect(page.getByTestId("body-reference-v2-action-reasons")).toContainText(
    "Capture / seed centerline and Set body-left from accepted BODY REFERENCE: Accept BODY REFERENCE (v1) first.",
  );
  await expect(page.getByTestId("body-reference-v2-action-reasons")).toContainText(
    "Accept v2 draft: Capture centerline or body-left outline first.",
  );
  await expect(page.getByTestId("body-reference-v2-generate-action-reasons")).toContainText(
    "Generate BODY CUTOUT QA from v2 mirrored profile: Capture centerline first.",
  );

  await waitForLocatorDisabledState(page.getByTestId("template-create-run-lookup"), true, 30_000);
  await waitForLocatorDisabledState(page.getByTestId("preview-mode-body-cutout-qa"), true, 30_000);
  await waitForLocatorDisabledState(page.getByTestId("preview-mode-wrap-export"), true, 30_000);
  await waitForLocatorDisabledState(page.getByRole("button", { name: "Full model", exact: true }), true, 30_000);
  await waitForLocatorDisabledState(page.getByRole("button", { name: "Source compare", exact: true }), true, 30_000);
  await waitForLocatorDisabledState(page.getByTestId("body-reference-v2-seed-centerline"), true, 30_000);
  await waitForLocatorDisabledState(page.getByTestId("body-reference-v2-seed-body-left"), true, 30_000);

  const lookupInput = page.getByPlaceholder(
    "https://www.academy.com/... or Stanley IceFlow 30 oz Classic Flip Straw Tumbler",
  );
  await lookupInput.fill("YETI Rambler 40 oz");
  await (await waitForLocatorEnabled(page.getByTestId("template-create-run-lookup"), 30_000)).click();

  await expect(page.getByText("Selected size 40 oz", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Authority Diameter primary", { exact: true })).toBeVisible({ timeout: 120_000 });

  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(productImage);
  await expect(page.getByText("Source ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Detect actionable", { exact: true })).toBeVisible();
  await waitForTextGone(page, "Upload a product photo first.");

  await expect(page.getByTestId("template-create-review-action-reasons")).toContainText(
    "Generate BODY CUTOUT QA GLB (v1): Accept BODY REFERENCE first.",
  );
  await waitForLocatorDisabledState(page.getByTestId("body-reference-v1-generate"), true, 30_000);

  await page.getByPlaceholder("YETI Rambler 40oz").fill(`Disabled Reason Smoke ${Date.now()}`);
  await (await waitForLocatorEnabled(page.getByTestId("body-reference-v1-accept"), 120_000)).click();

  await expect(page.getByTestId("body-reference-v2-action-reasons")).not.toContainText(
    "Accept BODY REFERENCE (v1) first.",
  );
  await expect(page.getByTestId("body-reference-v2-generate-action-reasons")).toContainText(
    "Generate BODY CUTOUT QA from v2 mirrored profile: Capture centerline first.",
  );
  await waitForLocatorEnabled(page.getByTestId("body-reference-v2-seed-centerline"), 30_000);
  await waitForLocatorEnabled(page.getByTestId("body-reference-v2-seed-body-left"), 30_000);
  await waitForLocatorDisabledState(page.getByTestId("body-reference-v2-generate"), true, 30_000);
  await expect(page.getByTestId("template-create-preview-action-reasons")).toContainText(
    "BODY CUTOUT QA: Generate reviewed GLB first.",
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

  await (await waitForLocatorEnabled(page.getByTestId("preview-mode-body-cutout-qa"), 120_000)).click();
  await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("BODY CUTOUT QA", {
    timeout: 120_000,
  });
  await expect(page.getByTestId("body-geometry-status-badge-status")).toHaveText("PASS");
  await expect(page.getByText("BODY CUTOUT QA: Generate reviewed GLB first.", { exact: true })).toHaveCount(0);

  await (await waitForLocatorEnabled(page.getByTestId("preview-mode-wrap-export"), 120_000)).click();
  await expect(page.getByText("WRAP / EXPORT PREVIEW", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("wrap-export-summary")).toContainText(
    "WRAP / EXPORT checks saved artwork placement and export preview.",
  );
});
