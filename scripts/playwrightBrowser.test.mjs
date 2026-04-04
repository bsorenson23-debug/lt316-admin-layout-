import test from "node:test";
import assert from "node:assert/strict";

import {
  getChromiumLaunchOptions,
  listChromiumExecutableCandidates,
  resolveChromiumExecutablePath,
} from "./playwrightBrowser.mjs";

test("resolveChromiumExecutablePath prefers explicit environment overrides", () => {
  const resolved = resolveChromiumExecutablePath({
    env: { PLAYWRIGHT_EXECUTABLE_PATH: "/custom/chromium", CHROME_BIN: "/ignored/chrome" },
    platform: "linux",
    exists: (candidate) => candidate === "/custom/chromium",
  });

  assert.equal(resolved, "/custom/chromium");
});

test("resolveChromiumExecutablePath falls back to common Linux browser paths", () => {
  const resolved = resolveChromiumExecutablePath({
    env: {},
    platform: "linux",
    exists: (candidate) => candidate === "/usr/bin/chromium-browser",
  });

  assert.equal(resolved, "/usr/bin/chromium-browser");
});

test("listChromiumExecutableCandidates removes empty values and duplicates", () => {
  const candidates = listChromiumExecutableCandidates({
    env: {
      PLAYWRIGHT_EXECUTABLE_PATH: " /usr/bin/chromium ",
      CHROME_BIN: "/usr/bin/chromium",
      CHROMIUM_PATH: "",
    },
    platform: "linux",
  });

  assert.equal(candidates[0], "/usr/bin/chromium");
  assert.equal(candidates.filter((candidate) => candidate === "/usr/bin/chromium").length, 1);
});

test("getChromiumLaunchOptions adds container-safe args on Linux", () => {
  const options = getChromiumLaunchOptions({
    env: { PLAYWRIGHT_EXECUTABLE_PATH: "/custom/chromium" },
    platform: "linux",
    exists: () => true,
    headless: true,
  });

  assert.equal(options.executablePath, "/custom/chromium");
  assert.deepEqual(options.args, ["--no-sandbox", "--disable-dev-shm-usage"]);
  assert.equal(options.headless, true);
});
