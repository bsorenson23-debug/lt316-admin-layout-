import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLaserBedSurfaceMappingSignature,
  type LaserBedArtworkPlacement,
  type LaserBedSurfaceMapping,
} from "./laserBedSurfaceMapping.ts";
import {
  ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN,
  buildEngravingOverlayPreviewItems,
  buildEngravingOverlayPreviewState,
} from "./engravingOverlayPreview.ts";

function createMapping(
  overrides: Partial<LaserBedSurfaceMapping> = {},
): LaserBedSurfaceMapping {
  return {
    mode: "cylindrical-v1",
    wrapDiameterMm: 88.9,
    wrapWidthMm: 279.29,
    printableTopMm: 12,
    printableBottomMm: 237,
    printableHeightMm: 225,
    expectedBodyWidthMm: 88.9,
    expectedBodyHeightMm: 225,
    bodyBounds: {
      width: 88.9,
      height: 225,
      depth: 88.9,
    },
    scaleSource: "mesh-bounds",
    seamAngleDeg: 0,
    frontCenterAngleDeg: 180,
    sourceHash: "source-hash",
    glbSourceHash: "source-hash",
    ...overrides,
  };
}

function createPlacement(
  overrides: Partial<LaserBedArtworkPlacement> = {},
): LaserBedArtworkPlacement {
  return {
    id: "art-1",
    assetId: "asset-1",
    name: "Front logo",
    xMm: 40,
    yMm: 30,
    widthMm: 50,
    heightMm: 24,
    rotationDeg: 15,
    visible: true,
    assetSnapshot: {
      svgText: "<svg viewBox=\"0 0 100 48\"><rect width=\"100\" height=\"48\" fill=\"#000\"/></svg>",
      sourceSvgText: "<svg viewBox=\"0 0 100 48\"><rect width=\"100\" height=\"48\" fill=\"#000\"/></svg>",
      documentBounds: { x: 0, y: 0, width: 100, height: 48 },
      artworkBounds: { x: 0, y: 0, width: 100, height: 48 },
    },
    ...overrides,
  };
}

test("overlay descriptor builds from saved artwork placement with cylindrical angle and body position", () => {
  const mapping = createMapping();
  const savedSignature = buildLaserBedSurfaceMappingSignature(mapping);
  const [item] = buildEngravingOverlayPreviewItems({
    placements: [createPlacement()],
    mapping,
    savedSignature,
    previewMode: "wrap-export",
  });

  assert.equal(item.id, "art-1");
  assert.equal(item.assetId, "asset-1");
  assert.equal(item.materialToken, ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN);
  assert.equal(item.visible, true);
  assert.equal(item.rotationDeg, 15);
  assert.equal(item.angleDeg, 83.7839);
  assert.equal(item.bodyYMm, 54);
  assert.equal(item.normalizedWrapX, 0.2327);
  assert.equal(item.normalizedBodyY, 0.1867);
  assert.deepEqual(item.errors, []);
});

test("overlay xMm maps to angle and yMm maps to body position", () => {
  const mapping = createMapping();
  const savedSignature = buildLaserBedSurfaceMappingSignature(mapping);
  const [item] = buildEngravingOverlayPreviewItems({
    placements: [createPlacement({
      xMm: 69.5,
      yMm: 18,
      widthMm: 0.645,
      heightMm: 12,
      rotationDeg: 0,
    })],
    mapping,
    savedSignature,
    previewMode: "wrap-export",
  });

  assert.equal(item.angleDeg, 90);
  assert.equal(item.bodyYMm, 36);
});

test("outside printable area warns and disables the overlay item", () => {
  const mapping = createMapping();
  const savedSignature = buildLaserBedSurfaceMappingSignature(mapping);
  const [item] = buildEngravingOverlayPreviewItems({
    placements: [createPlacement({
      xMm: 260,
      yMm: 210,
      widthMm: 40,
      heightMm: 30,
    })],
    mapping,
    savedSignature,
    previewMode: "wrap-export",
  });

  assert.equal(item.visible, false);
  assert.match(item.warnings.join(" "), /outside the printable wrap\/export area/i);
  assert.deepEqual(item.errors, []);
});

test("stale mapping warns and disables overlay preview", () => {
  const mapping = createMapping();
  const state = buildEngravingOverlayPreviewState({
    placements: [createPlacement()],
    mapping,
    savedSignature: `${buildLaserBedSurfaceMappingSignature(mapping)}-stale`,
    previewMode: "wrap-export",
  });

  assert.equal(state.freshness, "stale");
  assert.equal(state.enabled, false);
  assert.equal(state.status, "warn");
  assert.match(state.warnings.join(" "), /Mapping stale/i);
  assert.match(state.disabledReason ?? "", /current body source changed/i);
});

test("missing dimensions disables overlay preview", () => {
  const state = buildEngravingOverlayPreviewState({
    placements: [createPlacement()],
    mapping: createMapping({
      wrapDiameterMm: undefined,
      wrapWidthMm: undefined,
      printableHeightMm: undefined,
    }),
    previewMode: "wrap-export",
  });

  assert.equal(state.enabled, false);
  assert.equal(state.readyForPreview, false);
  assert.equal(state.status, "fail");
  assert.match(state.errors.join(" "), /wrapDiameterMm/i);
  assert.match(state.errors.join(" "), /wrapWidthMm/i);
  assert.match(state.errors.join(" "), /printableHeightMm/i);
});

test("overlay preview is only visible in wrap-export intent", () => {
  const mapping = createMapping();
  const savedSignature = buildLaserBedSurfaceMappingSignature(mapping);
  const [item] = buildEngravingOverlayPreviewItems({
    placements: [createPlacement()],
    mapping,
    savedSignature,
    previewMode: "body-cutout-qa",
  });
  const state = buildEngravingOverlayPreviewState({
    placements: [createPlacement()],
    mapping,
    savedSignature,
    previewMode: "body-cutout-qa",
  });

  assert.equal(item.visible, false);
  assert.equal(state.enabled, false);
  assert.equal(state.isBodyCutoutQaProof, false);
  assert.match(state.warnings.join(" "), /Switch to WRAP \/ EXPORT/i);
});

test("moving artwork changes overlay descriptors without changing body-source lineage", () => {
  const mapping = createMapping();
  const savedSignature = buildLaserBedSurfaceMappingSignature(mapping);
  const [before] = buildEngravingOverlayPreviewItems({
    placements: [createPlacement()],
    mapping,
    savedSignature,
    previewMode: "wrap-export",
  });
  const [after] = buildEngravingOverlayPreviewItems({
    placements: [createPlacement({
      xMm: 120,
      yMm: 48,
    })],
    mapping,
    savedSignature,
    previewMode: "wrap-export",
  });

  assert.notEqual(before.angleDeg, after.angleDeg);
  assert.notEqual(before.bodyYMm, after.bodyYMm);
  assert.equal(mapping.sourceHash, "source-hash");
  assert.equal(mapping.glbSourceHash, "source-hash");
});

test("missing placements return an empty disabled summary", () => {
  const state = buildEngravingOverlayPreviewState({
    placements: [],
    mapping: createMapping(),
    previewMode: "wrap-export",
  });

  assert.equal(state.totalCount, 0);
  assert.equal(state.visibleCount, 0);
  assert.equal(state.enabled, false);
  assert.equal(state.isBodyCutoutQaProof, false);
  assert.match(state.disabledReason ?? "", /No saved artwork placement yet/i);
});
