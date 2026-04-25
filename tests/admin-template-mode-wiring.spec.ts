import { expect, test } from "@playwright/test";

import {
  clickAndReadJsonResponse,
  openTemplateGallery,
  waitForLocatorEnabled,
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

test("template create and edit use one dedicated template mode and exit cleanly", async ({
  page,
}, testInfo) => {
  test.setTimeout(8 * 60 * 1000);

  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("__codex_admin_template_mode_wiring_reset__")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("__codex_admin_template_mode_wiring_reset__", "1");
    }
  });
  await ensureWebGlSupport(page, testInfo, "admin-template-mode-wiring");

  const templateName = `Template Mode Wiring ${Date.now()}`;

  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });
  await openTemplateGallery(page);
  await page.getByTestId("template-gallery-create-new").click();

  await expect(page.getByTestId("template-mode-shell")).toBeVisible();
  await expect(page.getByTestId("template-mode-title")).toHaveText("Create new template");
  await expect(page.getByTestId("template-create-form")).toHaveAttribute(
    "data-template-create-surface-mode",
    "page",
  );
  await expect(page.getByRole("button", { name: "Job", exact: true })).toHaveCount(0);

  await page.getByTestId("template-mode-exit").click();
  await expect(page.getByTestId("template-gallery-create-new")).toBeVisible();

  await page.getByTestId("template-gallery-create-new").click();
  await expect(page.getByTestId("template-mode-shell")).toBeVisible();
  await page.getByPlaceholder("YETI Rambler 40oz").fill(templateName);
  await page.getByTestId("template-product-type-select").selectOption("flat");
  await page.getByTestId("template-reference-dimensions-details").locator("summary").click();
  await page.getByTestId("template-print-height-input").fill("120");
  await page.getByTestId("template-create-save").click();

  await expect(page.getByTestId("template-mode-shell")).toHaveCount(0);
  await expect(page.getByTestId("selected-template-change-button")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("selected-template-edit-button")).toBeVisible();

  await page.getByTestId("selected-template-edit-button").click();
  await expect(page.getByTestId("template-mode-shell")).toBeVisible();
  await expect(page.getByTestId("template-mode-title")).toHaveText("Edit template");
  await page.getByTestId("template-mode-exit").click();

  await expect(page.getByTestId("template-mode-shell")).toHaveCount(0);
  await expect(page.getByTestId("selected-template-change-button")).toBeVisible();
});

test("BODY CUTOUT QA still works inside dedicated template mode", async ({
  page,
}, testInfo) => {
  test.setTimeout(10 * 60 * 1000);

  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("__codex_admin_template_mode_body_qa_reset__")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("__codex_admin_template_mode_body_qa_reset__", "1");
    }
  });
  await ensureWebGlSupport(page, testInfo, "admin-template-mode-body-qa");

  const productImage = getOperatorProductImageUpload();

  await page.goto("/admin?debug=1", { waitUntil: "networkidle", timeout: 120_000 });
  await openTemplateGallery(page);
  await page.getByTestId("template-gallery-create-new").click();

  await expect(page.getByTestId("template-mode-shell")).toBeVisible();
  await page.getByPlaceholder("YETI Rambler 40oz").fill(`Template QA Wiring ${Date.now()}`);

  const lookupInput = page.getByPlaceholder(
    "https://www.academy.com/... or Stanley IceFlow 30 oz Classic Flip Straw Tumbler",
  );
  await lookupInput.fill("YETI Rambler 40 oz");
  await page.getByTestId("template-create-run-lookup").click();

  await expect(page.getByText("Selected size 40 oz", { exact: true })).toBeVisible({ timeout: 120_000 });
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(productImage);
  await expect(page.getByText("Source ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Detect actionable", { exact: true })).toBeVisible();

  const acceptV1Button = page.getByTestId("body-reference-v1-accept");
  await (await waitForLocatorEnabled(acceptV1Button, 120_000)).click();

  const generateV1Button = page.getByTestId("body-reference-v1-generate");
  const generatedPayload = await clickAndReadJsonResponse<GeneratedBodyReferenceResponse>(
    page,
    async () => {
      await (await waitForLocatorEnabled(generateV1Button, 120_000)).click();
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
});
