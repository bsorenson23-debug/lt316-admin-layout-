import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyBodyGeometryContract, updateContractValidation } from "./bodyGeometryContract.ts";
import { buildBodyCutoutQaGuardState } from "./bodyCutoutQaGuard.ts";

test("BODY CUTOUT QA guard stays hidden for a passing body-only contract", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh"],
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 225, depth: 88.9 },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.equal(
    buildBodyCutoutQaGuardState({ mode: "body-cutout-qa", contract }),
    null,
  );
});

test("BODY CUTOUT QA guard shows exact accessory failure copy", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/body-with-accessories.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh", "lid_mesh", "handle_mesh"],
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 225, depth: 88.9 },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.deepEqual(buildBodyCutoutQaGuardState({ mode: "body-cutout-qa", contract }), {
    severity: "fail",
    reason: "accessory-detected",
    title: "BODY CUTOUT QA FAILED",
    message: "Accessory meshes detected — BODY CUTOUT QA expects body-only geometry.",
    blockingIssue: "Accessory meshes detected — BODY CUTOUT QA expects body-only geometry.",
  });
});

test("BODY CUTOUT QA guard reports missing body meshes when no body candidate exists", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/no-body.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["mystery_surface_candidate"],
    },
    dimensionsMm: {},
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.deepEqual(buildBodyCutoutQaGuardState({ mode: "body-cutout-qa", contract }), {
    severity: "fail",
    reason: "missing-body",
    title: "BODY CUTOUT QA FAILED",
    message: "No body mesh found.",
    blockingIssue: "No body mesh found.",
  });
});

test("BODY CUTOUT QA guard shows exact fallback failure copy", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/body-with-fallback.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh", "generated-placeholder-debug-mesh"],
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 225, depth: 88.9 },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.deepEqual(buildBodyCutoutQaGuardState({ mode: "body-cutout-qa", contract }), {
    severity: "fail",
    reason: "fallback-detected",
    title: "BODY CUTOUT QA FAILED",
    message: "Fallback geometry detected — not valid for BODY CUTOUT QA.",
    blockingIssue: "Fallback geometry detected — not valid for BODY CUTOUT QA.",
  });
});

test("BODY CUTOUT QA guard warns when freshness is unknown", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "sha256:glb",
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh"],
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 225, depth: 88.9 },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 225,
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.deepEqual(buildBodyCutoutQaGuardState({ mode: "body-cutout-qa", contract }), {
    severity: "warn",
    reason: "unknown-freshness",
    title: "BODY CUTOUT QA WARNING",
    message: "GLB freshness could not be verified — BODY CUTOUT QA is not confirmed.",
    blockingIssue: null,
  });
});

test("BODY CUTOUT QA guard does not render in non-QA modes", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "full-model",
    source: {
      type: "generated",
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh", "lid_mesh"],
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.equal(
    buildBodyCutoutQaGuardState({ mode: "full-model", contract }),
    null,
  );
});

test("BODY CUTOUT QA guard stays clear while loaded-scene inspection is pending and audit-provisional body geometry exists", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh"],
      bodyMeshNames: ["body_mesh"],
    },
    dimensionsMm: {
      bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 102.98,
      expectedBodyHeightMm: 245.8,
    },
    runtimeInspection: {
      status: "pending",
      source: "three-loaded-scene",
      auditArtifactPresent: true,
      auditArtifactUsedAsProvisionalTruth: true,
      loadedMeshNamesSource: "audit-provisional",
      bodyBoundsSource: "audit-provisional",
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.equal(
    buildBodyCutoutQaGuardState({ mode: "body-cutout-qa", contract }),
    null,
  );
});

test("BODY CUTOUT QA guard warns when loaded-scene inspection failed and audit metadata is being used provisionally", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh"],
      bodyMeshNames: ["body_mesh"],
    },
    dimensionsMm: {
      bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 102.98,
      expectedBodyHeightMm: 245.8,
    },
    runtimeInspection: {
      status: "failed",
      source: "three-loaded-scene",
      error: "Synthetic inspection failure",
      auditArtifactPresent: true,
      auditArtifactUsedAsProvisionalTruth: true,
      loadedMeshNamesSource: "audit-provisional",
      bodyBoundsSource: "audit-provisional",
    },
    validation: { status: "unknown", errors: [], warnings: [] },
  });

  assert.deepEqual(buildBodyCutoutQaGuardState({ mode: "body-cutout-qa", contract }), {
    severity: "warn",
    reason: "inspection-unavailable",
    title: "BODY CUTOUT QA WARNING",
    message: "Loaded-scene inspection unavailable; using generated audit metadata.",
    blockingIssue: null,
  });
});
