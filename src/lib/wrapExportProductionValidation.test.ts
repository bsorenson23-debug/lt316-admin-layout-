import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyBodyGeometryContract } from "./bodyGeometryContract.ts";
import {
  buildEngravingOverlayPreviewState,
} from "./engravingOverlayPreview.ts";
import {
  buildLaserBedSurfaceMappingSignature,
  type LaserBedArtworkPlacement,
  type LaserBedSurfaceMapping,
} from "./laserBedSurfaceMapping.ts";
import {
  createFinishBandReference,
} from "./productAppearanceReferenceLayers.ts";
import {
  summarizeWrapExportProductionReadiness,
  validateOverlayDescriptorMatchesSavedPlacement,
  validateWrapExportNotBodyCutoutQa,
} from "./wrapExportProductionValidation.ts";

function createContract() {
  return {
    ...createEmptyBodyGeometryContract(),
    mode: "wrap-export" as const,
    source: {
      type: "approved-svg" as const,
      hash: "source-hash",
    },
    glb: {
      path: "/api/admin/models/generated/demo-cutout.glb",
      sourceHash: "source-hash",
      freshRelativeToSource: true,
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh"],
      bodyMeshNames: ["body_mesh"],
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 225, depth: 88.9 },
      bodyBoundsUnits: "mm" as const,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      printableTopMm: 12,
      printableBottomMm: 237,
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
      scaleSource: "mesh-bounds" as const,
    },
    validation: { status: "unknown" as const, errors: [], warnings: [] },
  };
}

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

test("saved millimeter placement stays the WRAP / EXPORT authority", () => {
  const contract = createContract();
  const mapping = createMapping();
  const placement = createPlacement();
  const summary = summarizeWrapExportProductionReadiness({
    contract,
    mapping,
    placements: [placement],
    savedSignature: buildLaserBedSurfaceMappingSignature(mapping),
    previewMode: "wrap-export",
    appearanceReferenceLayers: [
      createFinishBandReference({
        id: "top-band",
        kind: "top-finish-band",
        yMm: 0,
        heightMm: 10,
      }),
    ],
  });

  assert.equal(summary.status, "pass");
  assert.equal(summary.readyForPreview, true);
  assert.equal(summary.readyForExactPlacement, true);
  assert.equal(summary.readyForViewerAgreement, true);
  assert.equal(summary.exportAuthority, "laser-bed-mm-placement");
  assert.equal(summary.notBodyCutoutQa, true);
  assert.equal(summary.placementCount, 1);
  assert.equal(summary.overlayCount, 1);
  assert.equal(summary.overlayEnabled, true);
  assert.equal(summary.mappingFreshness, "fresh");
  assert.equal(summary.bodyBoundsSource, "contract-dimensions");
  assert.equal(summary.appearanceReferenceLayerCount, 1);
  assert.equal(summary.appearanceReferenceContextOnly, true);
});

test("overlay descriptor matches the saved placement authority", () => {
  const mapping = createMapping();
  const placement = createPlacement();
  const overlayState = buildEngravingOverlayPreviewState({
    placements: [placement],
    mapping,
    savedSignature: buildLaserBedSurfaceMappingSignature(mapping),
    previewMode: "wrap-export",
  });

  const validation = validateOverlayDescriptorMatchesSavedPlacement({
    placement,
    mapping,
    savedSignature: buildLaserBedSurfaceMappingSignature(mapping),
    previewMode: "wrap-export",
    overlayItem: overlayState.items[0],
  });

  assert.equal(validation.status, "pass");
  assert.deepEqual(validation.errors, []);
});

test("moving artwork changes overlay placement without changing GLB lineage", () => {
  const contract = createContract();
  const mapping = createMapping();
  const savedSignature = buildLaserBedSurfaceMappingSignature(mapping);
  const beforePlacement = createPlacement();
  const afterPlacement = createPlacement({
    xMm: 120,
    yMm: 48,
  });
  const beforeOverlay = buildEngravingOverlayPreviewState({
    placements: [beforePlacement],
    mapping,
    savedSignature,
    previewMode: "wrap-export",
  }).items[0];
  const afterOverlay = buildEngravingOverlayPreviewState({
    placements: [afterPlacement],
    mapping,
    savedSignature,
    previewMode: "wrap-export",
  }).items[0];
  const beforeSummary = summarizeWrapExportProductionReadiness({
    contract,
    mapping,
    placements: [beforePlacement],
    savedSignature,
    previewMode: "wrap-export",
  });
  const afterSummary = summarizeWrapExportProductionReadiness({
    contract,
    mapping,
    placements: [afterPlacement],
    savedSignature,
    previewMode: "wrap-export",
  });

  assert.notEqual(beforeOverlay.angleDeg, afterOverlay.angleDeg);
  assert.notEqual(beforeOverlay.bodyYMm, afterOverlay.bodyYMm);
  assert.equal(beforeSummary.sourceHash, afterSummary.sourceHash);
  assert.equal(beforeSummary.glbSourceHash, afterSummary.glbSourceHash);
});

test("stale mapping is detected when source lineage drifts", () => {
  const mapping = createMapping({
    sourceHash: "accepted-source-hash",
    glbSourceHash: "stale-reviewed-glb-hash",
  });
  const summary = summarizeWrapExportProductionReadiness({
    contract: createContract(),
    mapping,
    placements: [createPlacement()],
    previewMode: "wrap-export",
  });

  assert.equal(summary.status, "warn");
  assert.equal(summary.mappingFreshness, "stale");
  assert.ok(summary.staleMappingWarningCount > 0);
  assert.match(summary.warnings.join(" "), /stale/i);
});

test("stale mapping is detected when wrap dimensions no longer match the saved signature", () => {
  const savedMapping = createMapping();
  const currentMapping = createMapping({
    wrapWidthMm: 281.12,
  });
  const summary = summarizeWrapExportProductionReadiness({
    contract: createContract(),
    mapping: currentMapping,
    placements: [createPlacement()],
    savedSignature: buildLaserBedSurfaceMappingSignature(savedMapping),
    previewMode: "wrap-export",
  });

  assert.equal(summary.status, "warn");
  assert.equal(summary.mappingFreshness, "stale");
  assert.ok(summary.staleMappingWarningCount > 0);
});

test("missing wrap dimensions fail WRAP / EXPORT readiness", () => {
  const summary = summarizeWrapExportProductionReadiness({
    contract: {
      ...createContract(),
      dimensionsMm: {
        ...createContract().dimensionsMm,
        wrapDiameterMm: undefined,
        wrapWidthMm: undefined,
      },
    },
    mapping: createMapping({
      wrapDiameterMm: undefined,
      wrapWidthMm: undefined,
      printableHeightMm: undefined,
    }),
    placements: [createPlacement()],
    previewMode: "wrap-export",
  });

  assert.equal(summary.status, "fail");
  assert.match(summary.errors.join(" "), /wrap diameter/i);
  assert.match(summary.errors.join(" "), /wrapDiameterMm/i);
  assert.match(summary.errors.join(" "), /printableHeightMm/i);
});

test("WRAP / EXPORT is never BODY CUTOUT QA proof", () => {
  const validation = validateWrapExportNotBodyCutoutQa();

  assert.equal(validation.status, "pass");
  assert.equal(validation.notBodyCutoutQa, true);
  assert.equal(validation.exportAuthority, "laser-bed-mm-placement");
});
