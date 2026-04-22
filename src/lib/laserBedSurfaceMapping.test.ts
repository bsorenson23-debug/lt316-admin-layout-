import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLaserBedSurfaceMappingSignature,
  compareLaserBedSurfaceMappingFreshness,
  computeBodyHeightFromYMm,
  computeWrapAngleFromXMm,
  validateLaserBedArtworkPlacement,
  validateLaserBedSurfaceMapping,
  type LaserBedSurfaceMapping,
} from "./laserBedSurfaceMapping.ts";

function createMapping(
  overrides: Partial<LaserBedSurfaceMapping> = {},
): LaserBedSurfaceMapping {
  return {
    mode: "cylindrical-v1",
    wrapDiameterMm: 82.55,
    wrapWidthMm: 259.34,
    printableTopMm: 25,
    printableBottomMm: 175,
    printableHeightMm: 150,
    expectedBodyWidthMm: 82.55,
    expectedBodyHeightMm: 150,
    bodyBounds: {
      width: 82.55,
      height: 150,
      depth: 82.55,
    },
    scaleSource: "mesh-bounds",
    seamAngleDeg: 0,
    frontCenterAngleDeg: 180,
    sourceHash: "source-hash",
    glbSourceHash: "source-hash",
    ...overrides,
  };
}

test("xMm converts to wrap angle using cylindrical v1 circumference math", () => {
  const result = computeWrapAngleFromXMm({
    xMm: 64.835,
    wrapWidthMm: 259.34,
    seamAngleDeg: 0,
    frontCenterAngleDeg: 90,
  });

  assert.equal(result.angleDeg, 90);
  assert.equal(result.frontRelativeAngleDeg, 0);
  assert.equal(result.normalizedWrapX, 0.25);
});

test("yMm converts to body height using printable-top offset", () => {
  const result = computeBodyHeightFromYMm({
    yMm: 30,
    printableTopMm: 25,
    printableHeightMm: 150,
  });

  assert.equal(result.bodyHeightMm, 55);
  assert.equal(result.normalizedHeight, 0.2);
});

test("artwork placement inside printable area passes", () => {
  const validation = validateLaserBedArtworkPlacement({
    mapping: createMapping(),
    placement: {
      id: "art-1",
      xMm: 20,
      yMm: 15,
      widthMm: 40,
      heightMm: 35,
    },
  });

  assert.equal(validation.status, "pass");
  assert.equal(validation.insidePrintableArea, true);
  assert.equal(validation.freshness, "fresh");
  assert.equal(validation.isBodyCutoutQaProof, false);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.wrapStartAngleDeg, 27.7628);
  assert.equal(validation.bodyTopMm, 40);
  assert.equal(validation.bodyBottomMm, 75);
});

test("artwork placement outside printable area fails", () => {
  const validation = validateLaserBedArtworkPlacement({
    mapping: createMapping(),
    placement: {
      id: "art-2",
      xMm: 240,
      yMm: 130,
      widthMm: 30,
      heightMm: 25,
    },
  });

  assert.equal(validation.status, "fail");
  assert.equal(validation.insidePrintableArea, false);
  assert.match(validation.errors[0] ?? "", /outside the printable wrap\/export area/i);
});

test("missing wrap dimensions fail mapping validation", () => {
  const validation = validateLaserBedSurfaceMapping({
    mapping: createMapping({
      wrapDiameterMm: undefined,
      wrapWidthMm: undefined,
      printableHeightMm: undefined,
    }),
  });

  assert.equal(validation.status, "fail");
  assert.equal(validation.readyForPreview, false);
  assert.equal(validation.readyForExactPlacement, false);
  assert.equal(validation.isBodyCutoutQaProof, false);
  assert.equal(validation.errors.length, 3);
  assert.match(validation.errors.join(" "), /wrapDiameterMm/);
  assert.match(validation.errors.join(" "), /wrapWidthMm/);
  assert.match(validation.errors.join(" "), /printableHeightMm/);
});

test("missing body bounds warns without failing core wrap mapping", () => {
  const validation = validateLaserBedSurfaceMapping({
    mapping: createMapping({
      bodyBounds: undefined,
    }),
  });

  assert.equal(validation.status, "warn");
  assert.equal(validation.readyForPreview, true);
  assert.equal(validation.readyForExactPlacement, false);
  assert.equal(validation.isBodyCutoutQaProof, false);
  assert.match(validation.warnings.join(" "), /missing bodyBounds/i);
});

test("stale mapping signature warns and freshness comparison reports stale", () => {
  const mapping = createMapping();
  const currentSignature = buildLaserBedSurfaceMappingSignature(mapping);
  const savedSignature = `${currentSignature}-older`;

  const freshness = compareLaserBedSurfaceMappingFreshness({
    currentSignature,
    savedSignature,
  });
  const validation = validateLaserBedSurfaceMapping({
    mapping,
    savedSignature,
  });

  assert.equal(freshness.freshness, "stale");
  assert.equal(freshness.reason, "signature-mismatch");
  assert.equal(validation.status, "warn");
  assert.equal(validation.freshness, "stale");
  assert.match(validation.warnings.join(" "), /signature is stale/i);
});

test("mapping freshness falls back to source lineage when no saved signature exists", () => {
  const freshness = compareLaserBedSurfaceMappingFreshness({
    sourceHash: "same-hash",
    glbSourceHash: "same-hash",
  });

  assert.equal(freshness.freshness, "fresh");
  assert.equal(freshness.reason, "source-lineage-match");
});

test("mapping freshness becomes stale after the body source hash changes", () => {
  const freshness = compareLaserBedSurfaceMappingFreshness({
    sourceHash: "accepted-source-hash",
    glbSourceHash: "stale-reviewed-glb-hash",
  });

  assert.equal(freshness.freshness, "stale");
  assert.equal(freshness.reason, "source-lineage-mismatch");
});

test("mapping signature is deterministic", () => {
  const mapping = createMapping();

  const left = buildLaserBedSurfaceMappingSignature(mapping);
  const right = buildLaserBedSurfaceMappingSignature({
    ...mapping,
    bodyBounds: { ...mapping.bodyBounds! },
  });

  assert.equal(left, right);
});
