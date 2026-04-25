import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureBodyContractFixtureFiles } from "./helpers/glbFixtureFactory";
import { ensureWebGlSupport } from "./helpers/webglSupport";

async function openHarnessScenario(
  page: Page,
  testInfo: TestInfo,
  scenario: "body-cutout-qa-valid" | "body-cutout-qa-accessory" | "body-cutout-qa-fallback" | "body-cutout-qa-stale" | "full-model-accessory",
): Promise<void> {
  await ensureWebGlSupport(page, testInfo, `body-contract-${scenario}`);
  await ensureBodyContractFixtureFiles();
  await page.goto(`/admin/debug/body-contract-viewer?scenario=${scenario}`);
  await expect(page.getByTestId("body-contract-viewer-harness")).toBeVisible();
  await expect(page.getByTestId("body-contract-viewer-viewport").locator("canvas")).toBeVisible();
}

async function openInspector(page: Page): Promise<void> {
  const summary = page.getByTestId("body-contract-inspector-summary");
  await expect(summary).toBeVisible();
  const inspector = page.getByTestId("body-contract-inspector");
  if ((await inspector.locator("details").first().evaluate((node) => (node as HTMLDetailsElement).open)) !== true) {
    await summary.click();
  }
  await expect(page.getByTestId("body-contract-inspector-meshes-section")).toBeVisible();
}

async function attachHarnessScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const screenshot = await page.getByTestId("body-contract-viewer-harness").screenshot();
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
}

test("ModelViewer shows a WebGL-unavailable fallback without mounting Canvas", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (function getContext(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
      if (contextId === "webgl2" || contextId === "webgl" || contextId === "experimental-webgl") {
        return null;
      }
      return (originalGetContext as unknown as (
        this: HTMLCanvasElement,
        contextId: string,
        ...innerArgs: unknown[]
      ) => unknown).call(this, contextId, ...args);
    }) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await ensureBodyContractFixtureFiles();
  await page.goto("/admin/debug/body-contract-viewer?scenario=body-cutout-qa-valid");

  await expect(page.getByTestId("body-contract-viewer-harness")).toBeVisible();
  await expect(page.getByTestId("model-viewer-webgl-unavailable")).toBeVisible();
  await expect(page.getByTestId("model-viewer-webgl-unavailable")).toContainText(
    "3D preview unavailable: this browser/session does not provide WebGL.",
  );
  await expect(page.getByTestId("model-viewer-webgl-unavailable")).toContainText(
    "BODY CUTOUT QA runtime inspection requires a WebGL-capable browser",
  );
  await expect(page.getByTestId("body-contract-viewer-viewport").locator("canvas")).toHaveCount(0);
  await expect(page.getByText("No body mesh found")).toHaveCount(0);
  await expect(page.getByTestId("body-contract-inspector-runtime-status")).toHaveCount(0);
  expect(consoleErrors.some((message) => message.includes("THREE.WebGLRenderer"))).toBe(false);
});

test("BODY CUTOUT QA valid body-only fixture shows PASS with no extras", async ({ page }, testInfo) => {
  await openHarnessScenario(page, testInfo, "body-cutout-qa-valid");

  await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("BODY CUTOUT QA");
  await expect(page.getByTestId("body-geometry-status-badge-note")).toContainText("Valid for body contour QA");
  await expect(page.getByTestId("body-geometry-status-badge-fallback")).toContainText("Disabled");
  await expect(page.getByTestId("body-geometry-status-badge-glb")).toContainText("Fresh");
  await expect(page.getByTestId("body-cutout-qa-guard-banner")).toHaveCount(0);

  await openInspector(page);
  await expect(page.getByTestId("body-contract-inspector-status")).toHaveText(/PASS/);
  await expect(page.getByTestId("body-contract-inspector-runtime-status")).toContainText("complete");
  await expect(page.getByTestId("body-contract-inspector-runtime-mesh-source")).toContainText("runtime-inspection");
  await expect(page.getByTestId("body-contract-inspector-body-meshes")).toContainText("body_mesh");
  await expect(page.getByTestId("body-contract-inspector-accessory-meshes")).toContainText("none");
  await expect(page.getByTestId("body-contract-inspector-fallback-meshes")).toContainText("none");
  await expect(page.getByTestId("body-contract-inspector-validation-status")).toContainText("PASS");

  await attachHarnessScreenshot(page, testInfo, "body-cutout-qa-valid");
});

test("BODY CUTOUT QA fails when accessory meshes are present", async ({ page }, testInfo) => {
  await openHarnessScenario(page, testInfo, "body-cutout-qa-accessory");

  await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("BODY CUTOUT QA");
  await expect(page.getByTestId("body-geometry-status-badge-status")).toHaveText("FAIL");
  await expect(page.getByTestId("body-cutout-qa-guard-message")).toHaveText(
    "Accessory meshes detected — BODY CUTOUT QA expects body-only geometry.",
  );

  await openInspector(page);
  await expect(page.getByTestId("body-contract-inspector-status")).toHaveText(/FAIL/);
  await expect(page.getByTestId("body-contract-inspector-accessory-meshes")).toContainText("lid_mesh");
  await expect(page.getByTestId("body-contract-inspector-accessory-meshes")).toContainText("handle_mesh");
  await expect(page.getByTestId("body-contract-inspector-validation-messages")).toContainText(
    "BODY CUTOUT QA expected exactly body geometry, but accessory meshes were found:",
  );
});

test("BODY CUTOUT QA fails when fallback meshes are present", async ({ page }, testInfo) => {
  await openHarnessScenario(page, testInfo, "body-cutout-qa-fallback");

  await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("BODY CUTOUT QA");
  await expect(page.getByTestId("body-geometry-status-badge-status")).toHaveText("FAIL");
  await expect(page.getByTestId("body-cutout-qa-guard-message")).toHaveText(
    "Fallback geometry detected — not valid for BODY CUTOUT QA.",
  );

  await openInspector(page);
  await expect(page.getByTestId("body-contract-inspector-status")).toHaveText(/FAIL/);
  await expect(page.getByTestId("body-contract-inspector-fallback-meshes")).toContainText("generated-placeholder-debug-mesh");
  await expect(page.getByTestId("body-contract-inspector-validation-messages")).toContainText(
    "Fallback geometry detected in body-only QA mode:",
  );
});

test("BODY CUTOUT QA fails when lineage marks the GLB as stale", async ({ page }, testInfo) => {
  await openHarnessScenario(page, testInfo, "body-cutout-qa-stale");

  await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("BODY CUTOUT QA");
  await expect(page.getByTestId("body-geometry-status-badge-status")).toHaveText("FAIL");
  await expect(page.getByTestId("body-geometry-status-badge-glb")).toContainText("Stale");
  await expect(page.getByTestId("body-cutout-qa-guard-message")).toHaveText(
    "GLB is stale relative to the current approved body contour.",
  );

  await openInspector(page);
  await expect(page.getByTestId("body-contract-inspector-status")).toHaveText(/FAIL/);
  await expect(page.getByTestId("body-contract-inspector-validation-messages")).toContainText(
    "GLB is stale relative to the current source contour.",
  );
});

test("full-model preview is clearly not valid for body contour QA", async ({ page }, testInfo) => {
  await openHarnessScenario(page, testInfo, "full-model-accessory");

  await expect(page.getByTestId("body-geometry-status-badge-title")).toHaveText("FULL MODEL PREVIEW");
  await expect(page.getByTestId("body-geometry-status-badge-note")).toContainText("Not valid for body contour QA");
  await expect(page.getByTestId("body-geometry-status-badge-geometry")).toContainText("Body + extras");
  await expect(page.getByTestId("body-cutout-qa-guard-banner")).toHaveCount(0);

  await openInspector(page);
  await expect(page.getByTestId("body-contract-inspector-status")).toHaveText(/PASS|WARN/);
  await expect(page.getByTestId("body-contract-inspector-accessory-meshes")).toContainText("lid_mesh");
  await expect(page.getByTestId("body-contract-inspector-accessory-meshes")).toContainText("handle_mesh");
});
