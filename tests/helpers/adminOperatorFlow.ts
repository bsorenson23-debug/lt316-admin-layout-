import fs from "node:fs/promises";

import { expect, type Locator, type Page } from "@playwright/test";

export type OverlaySummaryState = {
  enabled: string;
  count: number;
  firstAngle: string;
  firstBodyY: string;
};

export type ViewerOverlayState = {
  presence: string;
  count: number;
};

export async function waitForLocatorEnabled(locator: Locator, timeoutMs = 90_000): Promise<Locator> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await locator.isVisible().catch(() => false)) {
      const disabled = await locator.isDisabled().catch(() => true);
      if (!disabled) {
        return locator;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for locator to become enabled.");
}

export async function waitForLocatorDisabledState(
  locator: Locator,
  expectedDisabled: boolean,
  timeoutMs = 90_000,
): Promise<Locator> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await locator.isVisible().catch(() => false)) {
      const disabled = await locator.isDisabled().catch(() => true);
      if (disabled === expectedDisabled) {
        return locator;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for locator disabled state: ${expectedDisabled}.`);
}

export async function waitForTextGone(page: Page, text: string, timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const locator = page.getByText(text, { exact: true });
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
      return;
    }
    const visible = await locator.first().isVisible().catch(() => false);
    if (!visible) {
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for text to disappear: ${text}`);
}

export async function clickAndReadJsonResponse<T>(
  page: Page,
  action: () => Promise<unknown>,
  urlPart: string,
  timeoutMs = 120_000,
): Promise<T> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => candidate.url().includes(urlPart) && candidate.request().method() === "POST",
      { timeout: timeoutMs },
    ),
    action(),
  ]);
  return response.json() as Promise<T>;
}

export async function waitForLocatorText(
  locator: Locator,
  predicate: (text: string) => boolean,
  timeoutMs = 60_000,
): Promise<string> {
  const startedAt = Date.now();
  let lastText = "";
  while (Date.now() - startedAt < timeoutMs) {
    lastText = ((await locator.textContent().catch(() => "")) ?? "").trim();
    if (predicate(lastText)) {
      return lastText;
    }
    await locator.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for locator text predicate. Last text: ${lastText}`);
}

export async function readMetricMap(
  locator: Locator,
  labels: string[],
): Promise<Record<string, string>> {
  return locator.evaluate((root, wantedLabels) => {
    const wanted = new Set(wantedLabels);
    const metrics: Record<string, string> = {};
    for (const div of root.querySelectorAll("div")) {
      const spans = Array.from(div.querySelectorAll("span"));
      if (spans.length < 2) {
        continue;
      }
      const label = spans[0]?.textContent?.trim() ?? "";
      const value = spans[1]?.textContent?.trim() ?? "";
      if (wanted.has(label) && value) {
        metrics[label] = value;
      }
    }
    return metrics;
  }, labels);
}

export async function readOverlaySummaryState(page: Page): Promise<OverlaySummaryState> {
  const summary = page.getByTestId("wrap-export-summary");
  await summary.waitFor({ state: "visible", timeout: 30_000 });
  const [enabled, count, firstAngle, firstBodyY] = await Promise.all([
    summary.getAttribute("data-engraving-overlay-enabled"),
    summary.getAttribute("data-engraving-overlay-count"),
    summary.getAttribute("data-engraving-overlay-first-angle"),
    summary.getAttribute("data-engraving-overlay-first-body-y"),
  ]);
  return {
    enabled: enabled ?? "no",
    count: Number.parseInt(count ?? "0", 10),
    firstAngle: firstAngle ?? "",
    firstBodyY: firstBodyY ?? "",
  };
}

export async function readViewerOverlayState(
  page: Page,
  requestedPreviewMode: string,
): Promise<ViewerOverlayState> {
  const scaffold = page
    .locator(
      `[data-body-reference-preview-scaffold="present"][data-requested-preview-mode="${requestedPreviewMode}"]`,
    )
    .last();
  await scaffold.waitFor({ state: "visible", timeout: 30_000 });
  const viewer = scaffold.locator("[data-engraving-overlay-preview]").last();
  await viewer.waitFor({ state: "visible", timeout: 30_000 });
  const [presence, count] = await Promise.all([
    viewer.getAttribute("data-engraving-overlay-preview"),
    viewer.getAttribute("data-engraving-overlay-count"),
  ]);
  return {
    presence: presence ?? "absent",
    count: Number.parseInt(count ?? "0", 10),
  };
}

export async function waitForViewerOverlayState(
  page: Page,
  requestedPreviewMode: string,
  expectedPresence: string,
  timeoutMs = 30_000,
): Promise<ViewerOverlayState> {
  const startedAt = Date.now();
  let lastState = { presence: "absent", count: 0 };
  while (Date.now() - startedAt < timeoutMs) {
    lastState = await readViewerOverlayState(page, requestedPreviewMode);
    if (lastState.presence === expectedPresence) {
      return lastState;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Timed out waiting for viewer overlay state ${expectedPresence} in ${requestedPreviewMode}. Last state=${JSON.stringify(lastState)}`,
  );
}

export async function readSavedTemplate(page: Page, name: string): Promise<unknown> {
  return page.evaluate((templateNameArg) => {
    const parsed = JSON.parse(window.localStorage.getItem("lt316_product_templates") ?? "[]");
    const templates = Array.isArray(parsed)
      ? parsed
      : (parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { templates?: unknown[] }).templates)
          ? (parsed as { templates: unknown[] }).templates
          : []);
    return templates.find((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      return (entry as { name?: string }).name === templateNameArg;
    }) ?? null;
  }, name);
}

export async function openTemplateGallery(page: Page): Promise<void> {
  const browseProductsButton = page.getByTestId("browse-products-button");
  if (await browseProductsButton.isVisible().catch(() => false)) {
    await browseProductsButton.click();
    return;
  }

  const changeButton = page.getByTestId("selected-template-change-button").first();
  await changeButton.waitFor({ state: "visible", timeout: 30_000 });
  await changeButton.click();
}

export async function openBodyContractInspector(page: Page): Promise<void> {
  const summary = page.getByTestId("body-contract-inspector-summary");
  await expect(summary).toBeVisible();
  const inspector = page.getByTestId("body-contract-inspector");
  const details = inspector.locator("details").first();
  const open = await details.evaluate((node) => (node as HTMLDetailsElement).open);
  if (!open) {
    await summary.click();
  }
  await expect(page.getByTestId("body-contract-inspector-meshes-section")).toBeVisible();
}

export async function downloadBodyContractDebugReport(
  page: Page,
  targetPath: string,
): Promise<Record<string, unknown>> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByTestId("body-contract-download-debug-report").click(),
  ]);
  await download.saveAs(targetPath);
  const raw = await fs.readFile(targetPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}
