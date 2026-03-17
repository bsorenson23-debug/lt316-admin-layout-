import test from "node:test";
import assert from "node:assert/strict";
import { buildRotaryPlacementPreview } from "./rotaryCalibration.ts";

test("buildRotaryPlacementPreview computes centered export origin", () => {
  const preview = buildRotaryPlacementPreview({
    templateWidthMm: 276.15,
    rotaryCenterXmm: 256.275,
    rotaryTopYmm: 32,
    topAnchorOffsetMm: 0,
  });

  assert.equal(preview.exportOriginXmm, 118.2);
  assert.equal(preview.exportOriginYmm, 32);
});

test("buildRotaryPlacementPreview applies top anchor offset", () => {
  const preview = buildRotaryPlacementPreview({
    templateWidthMm: 250,
    rotaryCenterXmm: 170,
    rotaryTopYmm: 22,
    topAnchorOffsetMm: 7.5,
  });

  assert.equal(preview.effectiveTopAnchorYmm, 29.5);
  assert.equal(preview.exportOriginYmm, 29.5);
});
