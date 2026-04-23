import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyBodyGeometryContract } from "./bodyGeometryContract.ts";
import {
  buildWrapExportPreviewState,
  getWrapExportMappingStatusLabel,
  getWrapExportPreviewStatusLabel,
} from "./wrapExportPreviewState.ts";

test("wrap-export preview passes when reviewed geometry, wrap dimensions, and freshness are all available", () => {
  const state = buildWrapExportPreviewState({
    ...createEmptyBodyGeometryContract(),
    mode: "wrap-export",
    source: {
      type: "approved-svg",
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
      bodyBoundsUnits: "mm",
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      printableTopMm: 10,
      printableBottomMm: 235,
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
      scaleSource: "mesh-bounds",
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.equal(state.status, "pass");
  assert.equal(state.mappingStatus, "ready");
  assert.equal(state.readyForPreview, true);
  assert.equal(state.readyForExactPlacement, true);
  assert.equal(state.printableHeightMm, 225);
  assert.equal(state.isBodyCutoutQaProof, false);
  assert.deepEqual(state.errors, []);
  assert.deepEqual(state.warnings, []);
});

test("wrap-export preview fails when wrap dimensions are missing", () => {
  const state = buildWrapExportPreviewState({
    ...createEmptyBodyGeometryContract(),
    mode: "wrap-export",
    glb: {
      path: "/models/templates/yeti.glb",
      freshRelativeToSource: true,
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 225, depth: 88.9 },
      bodyBoundsUnits: "mm",
      scaleSource: "mesh-bounds",
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.equal(state.status, "fail");
  assert.equal(state.mappingStatus, "missing-dimensions");
  assert.equal(state.readyForPreview, false);
  assert.equal(state.readyForExactPlacement, false);
  assert.match(state.errors.join(" "), /wrap diameter and wrap width/i);
});

test("wrap-export preview warns when body bounds are missing", () => {
  const state = buildWrapExportPreviewState({
    ...createEmptyBodyGeometryContract(),
    mode: "wrap-export",
    glb: {
      path: "/api/admin/models/generated/demo-cutout.glb",
      freshRelativeToSource: true,
    },
    dimensionsMm: {
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      printableTopMm: 10,
      printableBottomMm: 235,
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
      scaleSource: "physical-wrap",
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.equal(state.status, "warn");
  assert.equal(state.mappingStatus, "unknown");
  assert.equal(state.readyForPreview, true);
  assert.equal(state.readyForExactPlacement, false);
  assert.match(state.warnings.join(" "), /viewer agreement is waiting on body bounds/i);
});

test("wrap-export preview warns when geometry is stale", () => {
  const state = buildWrapExportPreviewState({
    ...createEmptyBodyGeometryContract(),
    mode: "wrap-export",
    source: {
      type: "approved-svg",
      hash: "source-hash",
    },
    glb: {
      path: "/api/admin/models/generated/demo-cutout.glb",
      sourceHash: "old-hash",
      freshRelativeToSource: false,
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 225, depth: 88.9 },
      bodyBoundsUnits: "mm",
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      printableTopMm: 10,
      printableBottomMm: 235,
      scaleSource: "mesh-bounds",
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.equal(state.status, "warn");
  assert.equal(state.mappingStatus, "stale-geometry");
  assert.equal(state.readyForExactPlacement, false);
  assert.match(state.warnings.join(" "), /viewer agreement is stale/i);
});

test("wrap-export preview warns when no reviewed GLB is loaded", () => {
  const state = buildWrapExportPreviewState({
    ...createEmptyBodyGeometryContract(),
    mode: "wrap-export",
    glb: {
      path: "/models/templates/yeti.glb",
      freshRelativeToSource: true,
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 225, depth: 88.9 },
      bodyBoundsUnits: "mm",
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      printableTopMm: 10,
      printableBottomMm: 235,
      scaleSource: "mesh-bounds",
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.equal(state.status, "warn");
  assert.equal(state.mappingStatus, "no-reviewed-glb");
  assert.equal(state.readyForPreview, true);
  assert.equal(state.readyForExactPlacement, false);
  assert.equal(state.isBodyCutoutQaProof, false);
  assert.match(state.warnings.join(" "), /exact placement waits for a reviewed BODY CUTOUT QA GLB/i);
});

test("wrap-export helper status and mapping labels stay operator-readable", () => {
  assert.equal(getWrapExportPreviewStatusLabel("pass"), "PASS");
  assert.equal(getWrapExportPreviewStatusLabel("unknown"), "UNKNOWN");
  assert.equal(getWrapExportMappingStatusLabel("ready"), "Ready");
  assert.equal(getWrapExportMappingStatusLabel("stale-geometry"), "Stale reviewed geometry");
  assert.equal(getWrapExportMappingStatusLabel("no-reviewed-glb"), "Preview only - no reviewed GLB");
});
