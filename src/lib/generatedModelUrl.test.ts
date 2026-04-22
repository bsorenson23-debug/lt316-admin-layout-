import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeneratedModelUrl,
  isGeneratedModelUrl,
  isLegacyGeneratedModelPath,
  sanitizeGeneratedModelFileName,
} from "./generatedModelUrl.ts";

test("sanitizeGeneratedModelFileName accepts safe generated model names", () => {
  assert.equal(sanitizeGeneratedModelFileName("stanley-cutout.glb"), "stanley-cutout.glb");
  assert.equal(
    sanitizeGeneratedModelFileName("/models/generated/stanley-cutout.glb"),
    "stanley-cutout.glb",
  );
});

test("sanitizeGeneratedModelFileName rejects unsafe names", () => {
  assert.equal(sanitizeGeneratedModelFileName("../stanley-cutout.glb"), "stanley-cutout.glb");
  assert.equal(sanitizeGeneratedModelFileName(""), null);
});

test("buildGeneratedModelUrl builds the generated-model route", () => {
  assert.equal(
    buildGeneratedModelUrl("stanley-cutout.glb"),
    "/api/admin/models/generated/stanley-cutout.glb",
  );
});

test("generated model path helpers distinguish api and legacy paths", () => {
  assert.equal(isGeneratedModelUrl("/api/admin/models/generated/stanley-cutout.glb"), true);
  assert.equal(isGeneratedModelUrl("/models/generated/stanley-cutout.glb"), false);
  assert.equal(isLegacyGeneratedModelPath("/models/generated/stanley-cutout.glb"), true);
  assert.equal(isLegacyGeneratedModelPath("/models/templates/yeti-rambler-40oz.glb"), false);
});
