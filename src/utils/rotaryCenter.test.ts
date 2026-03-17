import assert from "node:assert/strict";
import test from "node:test";
import { getBedCenterXmm, resolveRotaryCenterXmm } from "./rotaryCenter.ts";

test("bed center helper returns midpoint from bed width", () => {
  assert.equal(getBedCenterXmm(300), 150);
});

test("no preset and no manual override defaults rotary center to bed center", () => {
  const center = resolveRotaryCenterXmm({
    selectedPresetRotaryCenterXmm: undefined,
    manualRotaryCenterXmm: undefined,
    bedWidthMm: 300,
  });
  assert.equal(center, 150);
});

test("preset value overrides bed center default", () => {
  const center = resolveRotaryCenterXmm({
    selectedPresetRotaryCenterXmm: 172.2,
    manualRotaryCenterXmm: undefined,
    bedWidthMm: 300,
  });
  assert.equal(center, 172.2);
});

test("manual override can take precedence when preferred", () => {
  const center = resolveRotaryCenterXmm({
    selectedPresetRotaryCenterXmm: 172.2,
    manualRotaryCenterXmm: 165.5,
    bedWidthMm: 300,
    preferManualOverride: true,
  });
  assert.equal(center, 165.5);
});
