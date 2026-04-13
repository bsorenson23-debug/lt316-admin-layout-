import test from "node:test";
import assert from "node:assert/strict";
import type { CanonicalDimensionCalibration } from "../types/productTemplate.ts";
import { deriveTumblerWorkspacePhotoRegistration } from "./tumblerWorkspacePhotoRegistration.ts";

function createCalibration(
  matrix: number[] = [0.5, 0, -50, 0, 1, 10],
): CanonicalDimensionCalibration {
  return {
    units: "mm",
    totalHeightMm: 310,
    bodyHeightMm: 240,
    lidBodyLineMm: 28,
    bodyBottomMm: 244,
    wrapDiameterMm: 100,
    baseDiameterMm: 80,
    wrapWidthMm: 314.16,
    frontVisibleWidthMm: 100,
    frontAxisPx: { xTop: 0, yTop: 0, xBottom: 0, yBottom: 0 },
    photoToFrontTransform: {
      type: "affine",
      matrix,
    },
    svgFrontViewBoxMm: {
      x: -50,
      y: 0,
      width: 100,
      height: 310,
    },
    wrapMappingMm: {
      frontMeridianMm: 235.62,
      backMeridianMm: 78.54,
      leftQuarterMm: 157.08,
      rightQuarterMm: 0,
    },
    glbScale: {
      unitsPerMm: 1,
    },
  };
}

test("deriveTumblerWorkspacePhotoRegistration maps image bounds through canonical calibration and rebases Y into printable-local coordinates", () => {
  const registration = deriveTumblerWorkspacePhotoRegistration({
    imageNaturalWidth: 200,
    imageNaturalHeight: 300,
    frontCenterMm: 235.62,
    backCenterMm: 78.54,
    mirrorFrontToBack: true,
    workspaceHeightMm: 162,
    workspaceTopFromOverallMm: 38,
    overallHeightMm: 310,
    topMarginMm: 38,
    bottomMarginMm: 40,
    calibration: createCalibration(),
  });

  assert.equal(registration.mode, "canonical-front");
  assert.deepEqual(registration.contextFrontRectMm, {
    x: 185.62,
    y: -38,
    width: 100,
    height: 310,
  });
  assert.deepEqual(registration.printableFrontRectMm, {
    x: 185.62,
    y: 0,
    width: 100,
    height: 162,
  });
  assert.deepEqual(registration.contextMirroredBackRectMm, {
    x: 28.54,
    y: -38,
    width: 100,
    height: 310,
  });
  assert.deepEqual(registration.printableMirroredBackRectMm, {
    x: 28.54,
    y: 0,
    width: 100,
    height: 162,
  });
  assert.deepEqual(registration.cropRectPx, {
    x: 0,
    y: 0,
    width: 200,
    height: 300,
  });
  assert.equal(registration.topOverflowMm, 38);
  assert.equal(registration.bottomOverflowMm, 110);
});

test("deriveTumblerWorkspacePhotoRegistration preserves the existing front-center anchor while supporting wider canonical bounds", () => {
  const registration = deriveTumblerWorkspacePhotoRegistration({
    imageNaturalWidth: 240,
    imageNaturalHeight: 320,
    frontCenterMm: 235.62,
    workspaceHeightMm: 162,
    workspaceTopFromOverallMm: 38,
    overallHeightMm: 310,
    topMarginMm: 38,
    bottomMarginMm: 40,
    calibration: createCalibration([0.6, 0, -72, 0, 0.9, 12]),
  });

  assert.equal(registration.mode, "canonical-front");
  assert.equal(registration.contextFrontRectMm.x + (registration.contextFrontRectMm.width / 2), 235.62);
  assert.equal(registration.contextFrontRectMm.y, -38);
  assert.equal(registration.contextFrontRectMm.height, 310);
  assert.equal(registration.printableFrontRectMm.y, 0);
  assert.equal(registration.printableFrontRectMm.height, 162);
  assert.deepEqual(registration.cropRectPx, {
    x: 36.6667,
    y: 0,
    width: 166.6667,
    height: 320,
  });
});

test("deriveTumblerWorkspacePhotoRegistration falls back cleanly to legacy image fit when canonical calibration is unavailable", () => {
  const registration = deriveTumblerWorkspacePhotoRegistration({
    imageNaturalWidth: 100,
    imageNaturalHeight: 200,
    frontCenterMm: 235.62,
    backCenterMm: 78.54,
    mirrorFrontToBack: true,
    workspaceHeightMm: 162,
    workspaceTopFromOverallMm: 38,
    overallHeightMm: 242,
    topMarginMm: 38,
    bottomMarginMm: 42,
    calibration: null,
  });

  assert.equal(registration.mode, "legacy-fit");
  assert.deepEqual(registration.contextFrontRectMm, {
    x: 175.12,
    y: -38,
    width: 121,
    height: 242,
  });
  assert.deepEqual(registration.printableFrontRectMm, {
    x: 175.12,
    y: 0,
    width: 121,
    height: 162,
  });
  assert.deepEqual(registration.contextMirroredBackRectMm, {
    x: 18.04,
    y: -38,
    width: 121,
    height: 242,
  });
  assert.deepEqual(registration.printableMirroredBackRectMm, {
    x: 18.04,
    y: 0,
    width: 121,
    height: 162,
  });
  assert.equal(registration.cropRectPx, null);
  assert.equal(registration.topOverflowMm, 38);
  assert.equal(registration.bottomOverflowMm, 42);
});
