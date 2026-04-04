import { spawnSync } from "child_process";
import { mkdirSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

import { resolveChromiumExecutablePath } from "./playwrightBrowser.mjs";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const browsersPath = path.join(repoRoot, ".playwright-browsers");

mkdirSync(browsersPath, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= browsersPath;

const systemBrowser = resolveChromiumExecutablePath();

if (systemBrowser) {
  console.log(`[setup:playwright] Using existing Chromium binary at ${systemBrowser}`);
  process.exit(0);
}

const cliPath = require.resolve("playwright/cli");
const result = spawnSync(process.execPath, [cliPath, "install", "chromium"], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error(
    "[setup:playwright] No system Chromium binary was found and Playwright could not download one. " +
      "Set PLAYWRIGHT_EXECUTABLE_PATH or provide a reachable Playwright download host."
  );
}

process.exit(result.status ?? 1);
