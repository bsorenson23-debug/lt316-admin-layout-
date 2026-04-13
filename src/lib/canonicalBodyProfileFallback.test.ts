import test from "node:test";
import assert from "node:assert/strict";

import { createFallbackCanonicalBodyProfileFromCalibration } from "./canonicalBodyProfileFallback.ts";
import type { CanonicalDimensionCalibration } from "../types/productTemplate.ts";

test("createFallbackCanonicalBodyProfileFromCalibration synthesizes a body-only shell from saved calibration", () => {
  const calibration: CanonicalDimensionCalibration = {
    units: "mm",
    totalHeightMm: 273.8,
    bodyHeightMm: 216,
    lidBodyLineMm: 28,
    bodyBottomMm: 244,
    wrapDiameterMm: 99.82,
    baseDiameterMm: 78.7,
    wrapWidthMm: 313.59,
    frontVisibleWidthMm: 99.8,
    frontAxisPx: {
      xTop: 81.5,
      yTop: 92.4,
      xBottom: 81.5,
      yBottom: 463.1,
    },
    photoToFrontTransform: {
      type: "affine",
      matrix: [1, 0, 0, 0, 1, 0],
    },
    svgFrontViewBoxMm: {
      x: -49.9,
      y: 0,
      width: 99.8,
      height: 273.8,
    },
    wrapMappingMm: {
      frontMeridianMm: 235.19,
      backMeridianMm: 78.4,
      leftQuarterMm: 156.79,
      rightQuarterMm: 313.59,
    },
    axialSurfaceBands: [],
    printableSurfaceContract: {
      printableTopMm: 28,
      printableBottomMm: 244,
      printableHeightMm: 216,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
    glbScale: {
      unitsPerMm: 1,
    },
  };

  const profile = createFallbackCanonicalBodyProfileFromCalibration(calibration);

  assert.ok(profile);
  assert.equal(profile.axis.xTop, 81.5);
  assert.equal(profile.samples[0]?.yMm, 28);
  assert.equal(profile.samples.at(-1)?.yMm, 244);
  assert.ok(profile.samples[0]!.radiusMm > profile.samples.at(-1)!.radiusMm);
  assert.match(profile.svgPath, /^M /);
});
