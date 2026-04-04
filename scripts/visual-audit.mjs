import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const OUT = './tmp/audit';
const DIAG_FILE = path.join(OUT, 'runtime-diagnostics.json');
await mkdir(OUT, { recursive: true });

function diagnostics(error) {
  return {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    playwrightExecutablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? null,
    ci: Boolean(process.env.CI),
    githubActions: Boolean(process.env.GITHUB_ACTIONS),
    error: error
      ? {
          name: error.name,
          message: error.message,
        }
      : null,
  };
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const payload = diagnostics(error);
    await writeFile(DIAG_FILE, JSON.stringify(payload, null, 2), 'utf8');

    console.warn('\n[visual-audit] Unable to launch Playwright Chromium.');
    console.warn('[visual-audit] This runtime likely blocks browser downloads and has no preinstalled Playwright browser.');
    console.warn(`[visual-audit] Diagnostics saved to ${DIAG_FILE}`);
    console.warn('[visual-audit] Workarounds:');
    console.warn('  1) Run this audit in GitHub Actions (recommended for hosted snapshots).');
    console.warn('  2) Run in local/Docker where Playwright browsers are installed.');
    console.warn('  3) Use a runtime that sets PLAYWRIGHT_EXECUTABLE_PATH.\n');

    return null;
  }
}

const browser = await launchBrowser();
if (!browser) {
  process.exit(0);
}

const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

// Collect console errors
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

// Collect 404s
const missing404s = [];
page.on('response', res => {
  if (res.status() === 404) missing404s.push(res.url());
});

async function shot(name, note) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[SHOT] ${name} — ${note}`);
}

async function wait(ms) {
  await page.waitForTimeout(ms);
}

// ── 1. Initial load ──────────────────────────────────────────
await page.goto('http://localhost:3000/admin', {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await wait(1500);
await shot('01-initial-load', 'Fresh page load, no state');

// ── 2. Flat Bed mode ─────────────────────────────────────────
const flatBedBtn = page.locator('[class*="modeBtn"]', { hasText: 'Flat Bed' }).first();
if (await flatBedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  await flatBedBtn.click();
  await wait(500);
}
await shot('02-flat-bed-mode', 'Flat Bed tab active');

// ── 3. Tumbler mode ──────────────────────────────────────────
const tumblerBtn = page.locator('[class*="modeBtn"]', { hasText: 'Tumbler' }).first();
if (await tumblerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  await tumblerBtn.click();
  await wait(800);
}
await shot('03-tumbler-mode', 'Tumbler tab active');

// ── 4. Right panel tabs ──────────────────────────────────────
const rightTabs = ['Workflow', 'Tools', 'Setup', 'Calibration'];
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

// Go back to Workflow tab
const workflowTab = page.locator('button', { hasText: 'Workflow' }).first();
if (await workflowTab.isVisible({ timeout: 2000 }).catch(() => false)) {
  await workflowTab.click();
  await wait(400);
}

// ── 5. Pre-flight section ────────────────────────────────────
await shot('05-preflight-initial', 'Pre-flight checklist initial state');

// Scroll pre-flight into view
const preflight = page.locator('[class*="preflight"], [class*="preFlight"]').first();
if (await preflight.isVisible({ timeout: 2000 }).catch(() => false)) {
  await preflight.scrollIntoViewIfNeeded();
  await shot('05b-preflight-scrolled', 'Pre-flight scrolled into view');
}

// ── 6. Click each pre-flight item ───────────────────────────
const preflightItems = [
  'Rotary preset',
  'Cylinder diameter',
  'Template dimensions',
  'Top anchor calibrated',
];
for (const label of preflightItems) {
  const item = page.locator(`button:has-text("${label}")`).first();
  const isBtn = await item.isVisible({ timeout: 1500 }).catch(() => false);
  if (isBtn) {
    await item.click();
    await wait(700);
    await shot(
      `06-preflight-click-${label.toLowerCase().replace(/\s+/g, '-')}`,
      `After clicking preflight item: ${label}`
    );
    // Navigate back to Workflow tab after each click
    const wfTab = page.locator('button', { hasText: 'Workflow' }).first();
    if (await wfTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await wfTab.click();
      await wait(400);
    }
  } else {
    console.log(`[SKIP] Preflight item "${label}" not a button or not visible`);
  }
}

// ── 7. Left panel sections ───────────────────────────────────
await shot('07-left-panel', 'Left panel full view');

// Scroll left panel to templates
const templates = page.locator('text=TEMPLATES, text=Templates').first();
if (await templates.isVisible({ timeout: 2000 }).catch(() => false)) {
  await templates.scrollIntoViewIfNeeded();
  await shot('07b-templates-section', 'Templates section');
}

// ── 8. 3D Model Preview area ─────────────────────────────────
const modelPreview = page.locator('text=3D MODEL PREVIEW, text=3D Model Preview').first();
if (await modelPreview.isVisible({ timeout: 2000 }).catch(() => false)) {
  await modelPreview.scrollIntoViewIfNeeded();
  await shot('08-3d-model-preview', '3D model preview panel');
}

// ── 9. Material profile panel ────────────────────────────────
const matProfile = page.locator('text=MATERIAL PROFILE').first();
if (await matProfile.isVisible({ timeout: 2000 }).catch(() => false)) {
  await matProfile.scrollIntoViewIfNeeded();
  await shot('09-material-profile', 'Material profile section');
}

// ── 10. Full right panel scroll ──────────────────────────────
const rightPanel = page.locator('[class*="rightPanel"], [class*="right-panel"], aside').last();
if (await rightPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
  await rightPanel.evaluate(el => el.scrollTo(0, 0));
  await shot('10a-right-panel-top', 'Right panel scrolled to top');
  await rightPanel.evaluate(el => el.scrollTo(0, el.scrollHeight));
  await wait(300);
  await shot('10b-right-panel-bottom', 'Right panel scrolled to bottom');
  await rightPanel.evaluate(el => el.scrollTo(0, 0));
}

// ── 11. Export button state ──────────────────────────────────
const exportBtn = page.locator('button:has-text("Export for LightBurn")').first();
if (await exportBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  await exportBtn.scrollIntoViewIfNeeded();
  await shot('11-export-button', 'Export for LightBurn button state');
}

// ── 12. Calibration page ─────────────────────────────────────
await page.goto('http://localhost:3000/admin/calibration', {
  waitUntil: 'networkidle',
  timeout: 15000,
}).catch(() => console.log('[SKIP] /admin/calibration not found'));
await wait(1000);
await shot('12-calibration-page', 'Calibration page');

// ── 13. Back to admin ────────────────────────────────────────
await page.goto('http://localhost:3000/admin', {
  waitUntil: 'networkidle',
  timeout: 15000,
});
await wait(1000);

// ── REPORT ───────────────────────────────────────────────────
console.log('\n===== AUDIT REPORT =====');

if (consoleErrors.length > 0) {
  console.log('\nCONSOLE ERRORS:');
  [...new Set(consoleErrors)].forEach(e => console.log('  ✗', e));
} else {
  console.log('\nConsole errors: none');
}

if (missing404s.length > 0) {
  console.log('\n404s:');
  [...new Set(missing404s)].forEach(u => console.log('  ✗', u));
} else {
  console.log('404s: none');
}

console.log('\nScreenshots saved to:', OUT);
console.log('========================\n');

await browser.close();
