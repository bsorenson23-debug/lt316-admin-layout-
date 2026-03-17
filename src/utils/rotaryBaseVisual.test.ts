import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultRotaryPresetSeeds } from "../data/rotaryPlacementPresets.ts";
import { getRotaryBaseVisualForPreset, placeRotaryBaseFromAnchor } from "./rotaryBaseVisual.ts";

test("D80C base visual resolves with outline size, mount holes, and anchor point", () => {
  const preset = getDefaultRotaryPresetSeeds(300).find((entry) => entry.id === "d80c-chuck");
  assert.ok(preset);

  const visual = getRotaryBaseVisualForPreset({
    preset: preset ?? null,
    mountPatternXmm: preset?.mountPatternXmm,
    mountPatternYmm: preset?.mountPatternYmm,
    mountReferenceMode: preset?.mountReferenceMode,
  });

  assert.equal(visual.widthMm, 128);
  assert.equal(visual.depthMm, 164);
  assert.equal(visual.mountHoles.length, 4);
  assert.equal(visual.anchorReferencePoint.xMm, 26.5);
  assert.equal(visual.anchorReferencePoint.yMm, 32);
});

test("D100C base visual resolves with preset-specific footprint", () => {
  const preset = getDefaultRotaryPresetSeeds(300).find((entry) => entry.id === "d100c-chuck");
  assert.ok(preset);

  const visual = getRotaryBaseVisualForPreset({
    preset: preset ?? null,
    mountPatternXmm: preset?.mountPatternXmm,
    mountPatternYmm: preset?.mountPatternYmm,
    mountReferenceMode: preset?.mountReferenceMode,
  });

  assert.equal(visual.widthMm, 140);
  assert.equal(visual.depthMm, 176);
  assert.equal(visual.mountHoles.length, 4);
  assert.equal(visual.anchorReferencePoint.xMm, 32.5);
  assert.equal(visual.anchorReferencePoint.yMm, 38);
});

test("base visual placement follows selected anchor hole and axis offset", () => {
  const preset = getDefaultRotaryPresetSeeds(300).find((entry) => entry.id === "d100c-chuck");
  assert.ok(preset);
  const visual = getRotaryBaseVisualForPreset({
    preset: preset ?? null,
    mountPatternXmm: preset?.mountPatternXmm,
    mountPatternYmm: preset?.mountPatternYmm,
    mountReferenceMode: preset?.mountReferenceMode,
  });

  const placed = placeRotaryBaseFromAnchor({
    baseVisual: visual,
    selection: {
      primaryHole: { row: 3, col: 3, xMm: 87.5, yMm: 75 },
    },
    rotaryAxisXmm: 125,
    rotaryAxisYmm: 125,
    referenceToAxisOffsetXmm: preset?.referenceToAxisOffsetXmm,
    referenceToAxisOffsetYmm: preset?.referenceToAxisOffsetYmm,
  });

  assert.ok(placed);
  assert.equal(placed?.leftMm, 55);
  assert.equal(placed?.topMm, 37);
  assert.equal(placed?.axisCenter.xMm, 125);
  assert.equal(placed?.axisCenter.yMm, 125);
  assert.equal(placed?.mountHoles.length, 4);
  assert.equal(placed?.mountHoles[0]?.xMm, 87.5);
  assert.equal(placed?.mountHoles[0]?.yMm, 75);
  assert.equal(placed?.mountHoles[1]?.xMm, 162.5);
  assert.equal(placed?.mountHoles[1]?.yMm, 75);
});

test("unknown/custom visual falls back to placeholder schematic", () => {
  const visual = getRotaryBaseVisualForPreset({
    preset: {
      id: "custom-1",
      name: "Custom",
      family: "custom",
      bedOrigin: "top-left",
      rotaryCenterXmm: 150,
      chuckOrRoller: "chuck",
      mountReferenceMode: "custom",
    },
    mountReferenceMode: "custom",
  });

  assert.equal(visual.isPlaceholder, true);
  assert.equal(visual.widthMm, 130);
  assert.equal(visual.depthMm, 180);
});

test("no anchor selection does not crash base placement flow", () => {
  const preset = getDefaultRotaryPresetSeeds(300).find((entry) => entry.id === "d80c-chuck");
  assert.ok(preset);
  const visual = getRotaryBaseVisualForPreset({
    preset: preset ?? null,
    mountPatternXmm: preset?.mountPatternXmm,
    mountPatternYmm: preset?.mountPatternYmm,
    mountReferenceMode: preset?.mountReferenceMode,
  });

  const placed = placeRotaryBaseFromAnchor({
    baseVisual: visual,
    selection: {},
    rotaryAxisXmm: undefined,
    rotaryAxisYmm: undefined,
    referenceToAxisOffsetXmm: preset?.referenceToAxisOffsetXmm,
    referenceToAxisOffsetYmm: preset?.referenceToAxisOffsetYmm,
  });

  assert.equal(placed, null);
});
