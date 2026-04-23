import test from "node:test";
import assert from "node:assert/strict";

import { buildBodyGeometryStatusBadgeState } from "./bodyGeometryStatusBadge.ts";
import { createEmptyBodyGeometryContract, updateContractValidation } from "./bodyGeometryContract.ts";

test("body-cutout QA badge passes for clean body-only contract", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "source-hash",
    },
    glb: {
      path: "/api/admin/models/generated/demo.glb",
      hash: "glb-hash",
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
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  const state = buildBodyGeometryStatusBadgeState({
    mode: "body-cutout-qa",
    contract,
  });

  assert.equal(state.title, "BODY CUTOUT QA");
  assert.equal(state.status, "pass");
  assert.equal(state.geometryLabel, "Body only");
  assert.equal(state.fallbackLabel, "Disabled");
  assert.equal(state.glbLabel, "Fresh");
  assert.equal(state.qaLabel, "Valid for body contour QA");
  assert.equal(state.validForBodyQa, true);
});

test("non-QA badge reports full model preview as not valid for body QA", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "full-model",
    source: {
      type: "generated",
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh", "lid_mesh"],
      bodyMeshNames: ["body_mesh"],
      accessoryMeshNames: ["lid_mesh"],
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  const state = buildBodyGeometryStatusBadgeState({
    mode: "full-model",
    contract,
  });

  assert.equal(state.title, "FULL MODEL PREVIEW");
  assert.equal(state.geometryLabel, "Body + extras");
  assert.equal(state.qaLabel, "Not valid for body contour QA");
  assert.equal(state.validForBodyQa, false);
});

test("alignment preview badge stays non-QA even when the loaded geometry is only a degraded fallback", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "alignment-model",
    source: {
      type: "generated",
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh", "rim_mesh"],
      bodyMeshNames: ["body_mesh"],
      accessoryMeshNames: ["rim_mesh"],
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: ["Full model preview degraded to canonical alignment fallback."],
    },
  });

  const state = buildBodyGeometryStatusBadgeState({
    mode: "alignment-model",
    contract,
  });

  assert.equal(state.title, "ALIGNMENT PREVIEW");
  assert.equal(state.status, "warn");
  assert.equal(state.geometryLabel, "Body + extras");
  assert.equal(state.qaLabel, "Not valid for body contour QA");
  assert.equal(state.validForBodyQa, false);
});

test("wrap-export badge reports mapping readiness without treating the preview as BODY CUTOUT QA", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "wrap-export",
    source: {
      type: "approved-svg",
      hash: "source-hash",
    },
    glb: {
      path: "/api/admin/models/generated/demo-cutout.glb",
      hash: "glb-hash",
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
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
      printableTopMm: 12,
      printableBottomMm: 237,
      scaleSource: "mesh-bounds",
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  const state = buildBodyGeometryStatusBadgeState({
    mode: "wrap-export",
    contract,
  });

  assert.equal(state.title, "WRAP / EXPORT PREVIEW");
  assert.equal(state.status, "pass");
  assert.equal(state.mappingLabel, "Ready");
  assert.equal(state.qaLabel, "Separate from BODY CUTOUT QA · Preview and export checks ready");
  assert.equal(state.validForBodyQa, false);
});

test("unknown QA state reports unknown freshness and QA status", () => {
  const state = buildBodyGeometryStatusBadgeState({
    mode: "body-cutout-qa",
    contract: null,
  });

  assert.equal(state.status, "unknown");
  assert.equal(state.sourceLabel, "Unknown");
  assert.equal(state.geometryLabel, "Unknown");
  assert.equal(state.fallbackLabel, "Unknown");
  assert.equal(state.glbLabel, "Unknown");
  assert.equal(state.qaLabel, "QA status unknown");
  assert.equal(state.validForBodyQa, null);
});
