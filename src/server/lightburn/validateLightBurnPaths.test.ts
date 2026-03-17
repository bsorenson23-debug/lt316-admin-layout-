import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateLightBurnDeviceBundlePath,
  validateLightBurnOutputFolderPath,
  validateLightBurnPathSettings,
  validateLightBurnTemplatePath,
} from "./validateLightBurnPaths.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lt316-lightburn-paths-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("valid .lbrn2 path passes validation", async () => {
  await withTempDir(async (dir) => {
    const templatePath = join(dir, "template.lbrn2");
    await writeFile(templatePath, "<LightBurnProject />", "utf8");

    const result = await validateLightBurnTemplatePath(templatePath);
    assert.equal(result.status, "valid");
  });
});

test("invalid template extension fails validation", async () => {
  const result = await validateLightBurnTemplatePath("C:\\LightBurn\\template.txt");
  assert.equal(result.status, "invalid-extension");
});

test("valid output folder path passes validation", async () => {
  await withTempDir(async (dir) => {
    const outputDir = join(dir, "jobs");
    await mkdir(outputDir, { recursive: true });

    const result = await validateLightBurnOutputFolderPath(outputDir);
    assert.equal(result.status, "valid");
  });
});

test("valid .lbzip path passes validation", async () => {
  await withTempDir(async (dir) => {
    const bundlePath = join(dir, "machine.lbzip");
    await writeFile(bundlePath, "bundle-data", "utf8");

    const result = await validateLightBurnDeviceBundlePath(bundlePath);
    assert.equal(result.status, "valid");
  });
});

test("missing paths return missing status", async () => {
  const result = await validateLightBurnPathSettings({});
  assert.equal(result.templateProjectPath.status, "missing");
  assert.equal(result.outputFolderPath.status, "missing");
  assert.equal(result.deviceBundlePath.status, "missing");
});

