import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { hasPlaywrightBrowserBundle, originUrlToActionsWorkflowUrl } from "./run-visual-audit.mjs";

test("originUrlToActionsWorkflowUrl handles https remotes", () => {
  assert.equal(
    originUrlToActionsWorkflowUrl("https://github.com/bsorenson23-debug/lt316-admin-layout-.git"),
    "https://github.com/bsorenson23-debug/lt316-admin-layout-/actions/workflows/visual-audit.yml"
  );
});

test("originUrlToActionsWorkflowUrl handles ssh remotes", () => {
  assert.equal(
    originUrlToActionsWorkflowUrl("git@github.com:bsorenson23-debug/lt316-admin-layout-.git"),
    "https://github.com/bsorenson23-debug/lt316-admin-layout-/actions/workflows/visual-audit.yml"
  );
});

test("hasPlaywrightBrowserBundle detects Chromium directories", () => {
  const bundleRoot = mkdtempSync(path.join(os.tmpdir(), "lt316-pw-bundle-"));
  try {
    mkdirSync(path.join(bundleRoot, "chromium-1208"));
    assert.equal(hasPlaywrightBrowserBundle(bundleRoot), true);
  } finally {
    rmSync(bundleRoot, { force: true, recursive: true });
  }
});

test("hasPlaywrightBrowserBundle returns false when the cache is empty", () => {
  const bundleRoot = mkdtempSync(path.join(os.tmpdir(), "lt316-pw-empty-"));
  try {
    assert.equal(hasPlaywrightBrowserBundle(bundleRoot), false);
  } finally {
    rmSync(bundleRoot, { force: true, recursive: true });
  }
});
