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
      svgQuality: {
        status: "pass",
        contourSource: "direct-contour",
        boundsUnits: "mm",
        pointCount: 88,
        segmentCount: 88,
        closed: true,
        closeable: false,
        duplicatePointCount: 0,
        nearDuplicatePointCount: 0,
        tinySegmentCount: 0,
        suspiciousSpikeCount: 0,
        suspiciousJumpCount: 0,
        expectedBridgeSegmentCount: 2,
        warnings: [],
        errors: [],
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
  assert.equal(parsed?.bodyGeometryContract?.svgQuality?.expectedBridgeSegmentCount, 2);
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
    svgQuality: {
      status: "pass",
      contourSource: "direct-contour",
      boundsUnits: "mm",
      pointCount: 88,
      segmentCount: 88,
      closed: true,
      closeable: false,
      duplicatePointCount: 0,
      nearDuplicatePointCount: 0,
      tinySegmentCount: 0,
      suspiciousSpikeCount: 0,
      suspiciousJumpCount: 0,
      expectedBridgeSegmentCount: 2,
      warnings: [],
      errors: [],
    },
  });

  assert.ok(parsed);
  assert.equal(parsed?.meshes.bodyMeshNames[0], "body_mesh");
  assert.equal(parsed?.meshes.fallbackDetected, false);
  assert.equal(parsed?.validation.status, "pass");
  assert.equal(parsed?.svgQuality?.expectedBridgeSegmentCount, 2);
});

test("runtime-truth parsers accept BODY REFERENCE v2 mirrored-profile contracts", () => {
  const parsed = parseBodyReferenceGlbResponse({
    glbPath: "/api/admin/models/generated/stanley-cutout-v2.glb",
    auditJsonPath: "C:/tmp/stanley-cutout-v2.audit.json",
    modelStatus: "generated-reviewed-model",
    renderMode: "body-cutout-qa",
    generatedSourceSignature: "body-reference-v2-signature",
    modelSourceLabel: "Generated from BODY REFERENCE v2 mirrored profile",
    bodyGeometryContract: {
      contractVersion: "2026-04-20-v1",
      mode: "body-cutout-qa",
      source: {
        type: "body-reference-v2",
        hash: "sha256:v2-source",
        detectedBodyOnly: true,
        centerlineCaptured: true,
        leftBodyOutlineCaptured: true,
        mirroredBodyGenerated: true,
        blockedRegionCount: 0,
        generationSourceMode: "v2-mirrored-profile",
      },
      glb: {
        path: "/api/admin/models/generated/stanley-cutout-v2.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:v2-source",
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
        bodyBounds: { width: 88.9, height: 185, depth: 88.9 },
        bodyBoundsUnits: "mm",
        wrapDiameterMm: 88.9,
        wrapWidthMm: 279.29,
        expectedBodyWidthMm: 88.9,
        expectedBodyHeightMm: 185,
        scaleSource: "lookup-diameter",
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    },
  });

  assert.ok(parsed);
  assert.equal(parsed?.bodyGeometryContract?.source.type, "body-reference-v2");
  assert.equal(parsed?.bodyGeometryContract?.dimensionsMm.scaleSource, "lookup-diameter");
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
