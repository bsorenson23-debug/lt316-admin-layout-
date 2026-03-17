import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultRotaryPresetSeeds } from "../data/rotaryPlacementPresets.ts";
import { getBedCenterXmm } from "./rotaryCenter.ts";
import {
  buildEmptyRotaryDraft,
  buildRotaryDraftFromPreset,
  formatRotaryPresetReadout,
  formatRotaryValue,
  resolveMountFootprintFromDraft,
  validateRotaryPresetDraft,
} from "./rotaryMode.ts";

test("preset draft loads D80C defaults correctly", () => {
  const d80c = getDefaultRotaryPresetSeeds(300).find((preset) => preset.id === "d80c-chuck");
  assert.ok(d80c);

  const draft = buildRotaryDraftFromPreset(d80c!);
  assert.equal(draft.mountPatternXmm, "75");
  assert.equal(draft.mountPatternYmm, "100");
  assert.equal(draft.axisHeightMm, "129");
  assert.equal(draft.chuckOrRoller, "chuck");
});

test("preset draft loads D100C defaults correctly", () => {
  const d100c = getDefaultRotaryPresetSeeds(300).find((preset) => preset.id === "d100c-chuck");
  assert.ok(d100c);

  const draft = buildRotaryDraftFromPreset(d100c!);
  assert.equal(draft.mountPatternXmm, "75");
  assert.equal(draft.mountPatternYmm, "100");
  assert.equal(draft.axisHeightMm, "129");
  assert.equal(draft.chuckOrRoller, "chuck");
});

test("talon preset keeps unknown mount pattern and axis height unset", () => {
  const talon = getDefaultRotaryPresetSeeds(300).find((preset) => preset.id === "rotoboss-talon");
  assert.ok(talon);

  const draft = buildRotaryDraftFromPreset(talon!);
  assert.equal(draft.mountPatternXmm, "");
  assert.equal(draft.mountPatternYmm, "");
  assert.equal(draft.axisHeightMm, "");
  assert.equal(draft.mountBoltSize, "unknown");
});

test("no preset uses bed-center rotary default", () => {
  const bedCenterXmm = getBedCenterXmm(300);
  const draft = buildEmptyRotaryDraft(bedCenterXmm);
  assert.equal(draft.rotaryCenterXmm, "150");
});

test("mount footprint resolves only when both mount dimensions exist", () => {
  const withFootprint = resolveMountFootprintFromDraft({
    ...buildEmptyRotaryDraft(150),
    mountPatternXmm: "75",
    mountPatternYmm: "100",
  });
  assert.deepEqual(withFootprint, { widthMm: 75, heightMm: 100 });

  const noFootprint = resolveMountFootprintFromDraft({
    ...buildEmptyRotaryDraft(150),
    mountPatternXmm: "75",
    mountPatternYmm: "",
  });
  assert.equal(noFootprint, null);
});

test("unknown rotary values render as measure-on-machine", () => {
  assert.equal(formatRotaryValue(undefined), "Measure on machine");
});

test("rotary readout reflects selected preset and resolved values", () => {
  const preset = getDefaultRotaryPresetSeeds(300)[0];
  const draft = buildRotaryDraftFromPreset(preset);

  const readout = formatRotaryPresetReadout({
    preset,
    draft,
    resolvedRotaryCenterXmm: 150,
    resolvedRotaryTopYmm: null,
  });

  assert.equal(readout.presetName, "D80C Chuck Rotary");
  assert.equal(readout.family, "d80c");
  assert.equal(readout.mountPattern, "75 x 100 mm");
  assert.equal(readout.axisCenterX, "150.00 mm");
  assert.equal(readout.topAnchorY, "Measure on machine");
});

test("valid rotary draft maps to typed preset payload", () => {
  const draft = {
    ...buildEmptyRotaryDraft(150),
    name: "Shop Custom",
    family: "custom" as const,
    mountPatternXmm: "80",
    mountPatternYmm: "105",
    axisHeightMm: "131",
    rotaryTopYmm: "24",
    notes: "Measured on machine",
  };

  const result = validateRotaryPresetDraft(draft);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.mountPatternXmm, 80);
  assert.equal(result.value.mountPatternYmm, 105);
  assert.equal(result.value.axisHeightMm, 131);
  assert.equal(result.value.rotaryCenterXmm, 150);
  assert.equal(result.value.rotaryTopYmm, 24);
});

