import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBodyGeometryAuditArtifact,
  parseBodyReferenceGlbResponse,
} from "./adminApi.schema.ts";

test("parseBodyReferenceGlbResponse accepts runtime-truth reviewed GLB payloads", () => {
  const parsed = parseBodyReferenceGlbResponse({
    glbPath: "/api/admin/models/generated/stanley-cutout.glb",
    auditJsonPath: "C:/tmp/stanley-cutout.audit.json",
    modelStatus: "generated-reviewed-model",
    renderMode: "body-cutout-qa",
    generatedSourceSignature: "reviewed-source-signature",
    modelSourceLabel: "Generated from accepted BODY REFERENCE cutout",
    bodyGeometryContract: {
      contractVersion: "2026-04-20-v1",
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
        detectedBodyOnly: true,
      },
      glb: {
        path: "/api/admin/models/generated/stanley-cutout.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: [],
        fallbackMeshNames: [],
        fallbackDetected: false,
        unexpectedMeshes: [],
      },
      dimensionsMm: {
        bodyBounds: { width: 88.9, height: 245.8, depth: 88.9 },
        bodyBoundsUnits: "mm",
        wrapDiameterMm: 88.9,
        wrapWidthMm: 279.29,
        expectedBodyWidthMm: 88.9,
        expectedBodyHeightMm: 245.8,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
      runtimeInspection: {
        status: "complete",
        source: "three-loaded-scene",
        auditArtifactPresent: true,
      },
    },
  });

  assert.ok(parsed);
  assert.equal(parsed?.renderMode, "body-cutout-qa");
  assert.equal(parsed?.bodyGeometryContract?.meshes.bodyMeshNames[0], "body_mesh");
  assert.equal(parsed?.bodyGeometryContract?.glb.freshRelativeToSource, true);
});

test("parseBodyGeometryAuditArtifact accepts body-only audit artifacts", () => {
  const parsed = parseBodyGeometryAuditArtifact({
    contractVersion: "2026-04-20-v1",
    generatedAt: "2026-04-21T00:00:00.000Z",
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/stanley-cutout.glb",
      name: "stanley-cutout.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: ["body_mesh"],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: { width: 88.9, height: 245.8, depth: 88.9 },
      bodyBoundsUnits: "mm",
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 245.8,
    },
    validation: {
      status: "pass",
      errors: [],
      warnings: [],
    },
  });

  assert.ok(parsed);
  assert.equal(parsed?.meshes.bodyMeshNames[0], "body_mesh");
  assert.equal(parsed?.meshes.fallbackDetected, false);
  assert.equal(parsed?.validation.status, "pass");
});

test("runtime-truth parsers reject missing required contract fields", () => {
  assert.equal(
    parseBodyReferenceGlbResponse({
      glbPath: "/api/admin/models/generated/stanley-cutout.glb",
      bodyGeometryContract: {
        mode: "body-cutout-qa",
      },
    }),
    null,
  );

  assert.equal(
    parseBodyGeometryAuditArtifact({
      mode: "body-cutout-qa",
      meshes: {},
    }),
    null,
  );
});
