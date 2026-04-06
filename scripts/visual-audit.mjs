import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { launchChromium } from "./playwrightBrowser.mjs";

const OUT = "./tmp/audit";
const BASE_URL = process.env.VISUAL_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(repoRoot, ".playwright-browsers");

await mkdir(OUT, { recursive: true });

const browser = await launchChromium({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const consoleErrors = [];
function isIgnorableConsoleError(message) {
  return (
    message.includes("/_next/webpack-hmr") &&
    message.includes("WebSocket connection") &&
    message.includes("ERR_INVALID_HTTP_RESPONSE")
  );
}

page.on("console", (msg) => {
  if (msg.type() === "error") {
    const message = msg.text();
    if (!isIgnorableConsoleError(message)) {
      consoleErrors.push(message);
    }
  }
});

const missing404s = [];
page.on("response", (res) => {
  if (res.status() === 404) {
    missing404s.push(res.url());
  }
});

async function shot(name, note) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[SHOT] ${name} - ${note}`);
}

async function wait(ms) {
  await page.waitForTimeout(ms);
}

async function closeDialogIfOpen() {
  const dialog = page.locator('[role="dialog"]').first();
  const isVisible = await dialog.isVisible({ timeout: 500 }).catch(() => false);
  if (!isVisible) {
    return;
  }

  const closeBtn = dialog.locator('button:has-text("Close")').first();
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await wait(400);
}

await page.goto(`${BASE_URL}/admin`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await wait(1500);
await shot("01-initial-load", "Fresh page load, no state");

const flatBedBtn = page.locator('[class*="modeBtn"]', { hasText: "Flat Bed" }).first();
if (await flatBedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  await flatBedBtn.click();
  await wait(500);
}
await shot("02-flat-bed-mode", "Flat Bed tab active");

const tumblerBtn = page.locator('[class*="modeBtn"]', { hasText: "Tumbler" }).first();
if (await tumblerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  await tumblerBtn.click();
  await wait(800);
}
await shot("03-tumbler-mode", "Tumbler tab active");

const rightTabs = ["Production", "Tools", "Setup"];
for (const tab of rightTabs) {
  const tabBtn = page.locator(`[role="tab"]:has-text("${tab}"), button:has-text("${tab}")`).first();
  if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tabBtn.click();
    await wait(600);
    await shot(`04-right-tab-${tab.toLowerCase()}`, `Right panel ${tab} tab`);
  } else {
    console.log(`[SKIP] Tab "${tab}" not found`);
  }
}

const productionTab = page.locator("button", { hasText: "Production" }).first();
if (await productionTab.isVisible({ timeout: 2000 }).catch(() => false)) {
  await productionTab.click();
  await wait(400);
}

await shot("05-preflight-initial", "Pre-flight checklist initial state");

const preflight = page.locator('[class*="preflight"], [class*="preFlight"]').first();
if (await preflight.isVisible({ timeout: 2000 }).catch(() => false)) {
  await preflight.scrollIntoViewIfNeeded();
  await shot("05b-preflight-scrolled", "Pre-flight scrolled into view");
}

const preflightItems = ["Product template", "Placement", "Machine + lens", "Material profile", "Export handoff"];
for (const label of preflightItems) {
  const item = page.locator(`button:has-text("${label}")`).first();
  const isBtn = await item.isVisible({ timeout: 1500 }).catch(() => false);
  if (isBtn) {
    await item.click();
    await wait(700);
    await shot(
      `06-preflight-click-${label.toLowerCase().replace(/\s+/g, "-")}`,
      `After clicking preflight item: ${label}`
    );
    await closeDialogIfOpen();

    const prodTab = page.locator("button", { hasText: "Production" }).first();
    if (await prodTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await prodTab.click();
      await wait(400);
    }
  } else {
    console.log(`[SKIP] Preflight item "${label}" not a button or not visible`);
  }
}

await shot("07-left-panel", "Left panel full view");

const templates = page.locator("text=TEMPLATES, text=Templates").first();
if (await templates.isVisible({ timeout: 2000 }).catch(() => false)) {
  await templates.scrollIntoViewIfNeeded();
  await shot("07b-templates-section", "Templates section");
}

const modelPreview = page.locator("text=3D MODEL PREVIEW, text=3D Model Preview").first();
if (await modelPreview.isVisible({ timeout: 2000 }).catch(() => false)) {
  await modelPreview.scrollIntoViewIfNeeded();
  await shot("08-3d-model-preview", "3D model preview panel");
}

const matProfile = page.locator("text=MATERIAL PROFILE").first();
if (await matProfile.isVisible({ timeout: 2000 }).catch(() => false)) {
  await matProfile.scrollIntoViewIfNeeded();
  await shot("09-material-profile", "Material profile section");
}

const rightPanel = page.locator('[class*="rightPanel"], [class*="right-panel"], aside').last();
if (await rightPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
  await rightPanel.evaluate((el) => el.scrollTo(0, 0));
  await shot("10a-right-panel-top", "Right panel scrolled to top");
  await rightPanel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await wait(300);
  await shot("10b-right-panel-bottom", "Right panel scrolled to bottom");
  await rightPanel.evaluate((el) => el.scrollTo(0, 0));
}

const exportBtn = page
  .locator('button:has-text("Export Minimal LightBurn Bundle"), button:has-text("Export for LightBurn")')
  .first();
if (await exportBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  await exportBtn.scrollIntoViewIfNeeded();
  await shot("11-export-button", "Export for LightBurn button state");
}

await page
  .goto(`${BASE_URL}/admin/calibration`, {
    waitUntil: "networkidle",
    timeout: 15000,
  })
  .catch(() => console.log("[SKIP] /admin/calibration not found"));
await wait(1000);
await shot("12-calibration-page", "Calibration page");

await page.goto(`${BASE_URL}/admin`, {
  waitUntil: "networkidle",
  timeout: 15000,
});
await wait(1000);

console.log("\n===== AUDIT REPORT =====");

if (consoleErrors.length > 0) {
  console.log("\nCONSOLE ERRORS:");
  [...new Set(consoleErrors)].forEach((error) => console.log("  x", error));
} else {
  console.log("\nConsole errors: none");
}

if (missing404s.length > 0) {
  console.log("\n404s:");
  [...new Set(missing404s)].forEach((url) => console.log("  x", url));
} else {
  console.log("404s: none");
}

console.log("\nScreenshots saved to:", OUT);
console.log("========================\n");

await browser.close();
