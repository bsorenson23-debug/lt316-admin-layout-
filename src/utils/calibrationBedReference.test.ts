import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCalibrationBedOverlayMetrics,
  DEFAULT_CALIBRATION_OVERLAY_TOGGLES,
  isCalibrationOverlayVisible,
} from "./calibrationBedReference.ts";

test("overlay metrics map rotary values to bed percentages", () => {
  const metrics = buildCalibrationBedOverlayMetrics({
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryCenterXmm: 120,
    topAnchorYmm: 24,
    lensInsetMm: 12,
    bedOrigin: "top-left",
  });

  assert.equal(metrics.rotaryCenterXPercent, 40);
  assert.equal(metrics.topAnchorYPercent, 8);
  assert.equal(metrics.bedCenterXPercent, 50);
  assert.equal(metrics.bedCenterYPercent, 50);
});

test("overlay metrics resolve origin marker from selected bed origin", () => {
  const topRight = buildCalibrationBedOverlayMetrics({
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryCenterXmm: 150,
    topAnchorYmm: 20,
    lensInsetMm: 10,
    bedOrigin: "top-right",
  });

  assert.equal(topRight.originXPercent, 100);
  assert.equal(topRight.originYPercent, 0);

  const bottomLeft = buildCalibrationBedOverlayMetrics({
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryCenterXmm: 150,
    topAnchorYmm: 20,
    lensInsetMm: 10,
    bedOrigin: "bottom-left",
  });

  assert.equal(bottomLeft.originXPercent, 0);
  assert.equal(bottomLeft.originYPercent, 100);
});

test("lens field outline is clamped to valid workspace bounds", () => {
  const metrics = buildCalibrationBedOverlayMetrics({
    bedWidthMm: 300,
    bedHeightMm: 200,
    rotaryCenterXmm: 150,
    topAnchorYmm: 20,
    lensInsetMm: 500,
    bedOrigin: "top-left",
  });

  assert.equal(metrics.lensInsetXPercent, 33.33333333333333);
  assert.equal(metrics.lensInsetYPercent, 50);
  assert.equal(metrics.lensWidthPercent, 33.33333333333333);
  assert.equal(metrics.lensHeightPercent, 0);
});

test("overlay toggles are evaluated per-key", () => {
  assert.equal(
    isCalibrationOverlayVisible(
      DEFAULT_CALIBRATION_OVERLAY_TOGGLES,
      "showRotaryCenterline"
    ),
    true
  );

  assert.equal(
    isCalibrationOverlayVisible(
      { ...DEFAULT_CALIBRATION_OVERLAY_TOGGLES, showLensFieldOutline: false },
      "showLensFieldOutline"
    ),
    false
  );
});
