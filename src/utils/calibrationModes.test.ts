import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIBRATION_MODE_DEFINITIONS,
  DEFAULT_CALIBRATION_MODE,
  buildOverlayStateForMode,
  getDefaultOverlayTogglesForMode,
  getVisibleOverlayKeysForMode,
  isImplementedCalibrationMode,
  resolveCalibrationMode,
} from "./calibrationModes.ts";

test("default calibration mode is rotary", () => {
  assert.equal(DEFAULT_CALIBRATION_MODE, "rotary");
});

test("mode definitions include all calibration workspace modes", () => {
  const ids = CALIBRATION_MODE_DEFINITIONS.map((mode) => mode.id);
  assert.deepEqual(ids, [
    "rotary",
    "export",
    "lens",
    "laser",
    "geometry",
    "red-light",
    "distortion",
  ]);
});

test("mode resolver switches active mode", () => {
  assert.equal(resolveCalibrationMode("export"), "export");
  assert.equal(resolveCalibrationMode("lens"), "lens");
});

test("rotary mode defaults include rotary overlays", () => {
  const toggles = getDefaultOverlayTogglesForMode("rotary");
  assert.equal(toggles.showRotaryCenterline, true);
  assert.equal(toggles.showTopAnchorLine, true);
  assert.equal(toggles.showMountFootprint, true);
  assert.equal(toggles.showExportPreview, false);
});

test("export mode defaults include export preview overlay", () => {
  const toggles = getDefaultOverlayTogglesForMode("export");
  assert.equal(toggles.showExportPreview, true);
  assert.equal(toggles.showRotaryCenterline, true);
});

test("mode overlay filtering keeps only visible keys for active mode", () => {
  const filtered = buildOverlayStateForMode({
    mode: "lens",
    toggles: {
      showHoleGrid: true,
      showCenterline: true,
      showOrigin: true,
      showRotaryCenterline: true,
      showTopAnchorLine: true,
      showMountFootprint: true,
      showLensFieldOutline: true,
      showExportPreview: true,
    },
  });

  assert.equal(filtered.showLensFieldOutline, true);
  assert.equal(filtered.showCenterline, true);
  assert.equal(filtered.showHoleGrid, true);
  assert.equal(filtered.showRotaryCenterline, false);
  assert.equal(filtered.showTopAnchorLine, false);
  assert.equal(filtered.showMountFootprint, false);
  assert.equal(filtered.showExportPreview, false);
});

test("export mode exposes export preview in visible keys", () => {
  const keys = getVisibleOverlayKeysForMode("export");
  assert.equal(keys.includes("showExportPreview"), true);
});

test("placeholder implementation flags are correct", () => {
  assert.equal(isImplementedCalibrationMode("rotary"), true);
  assert.equal(isImplementedCalibrationMode("export"), true);
  assert.equal(isImplementedCalibrationMode("laser"), true);
  assert.equal(isImplementedCalibrationMode("geometry"), false);
  assert.equal(isImplementedCalibrationMode("red-light"), false);
  assert.equal(isImplementedCalibrationMode("distortion"), false);
});
