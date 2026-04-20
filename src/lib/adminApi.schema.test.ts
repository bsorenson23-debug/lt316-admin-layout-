import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBodyGeometryAuditArtifact,
  parseBodyReferenceGlbResponse,
  parseFlatItemLookupResponse,
  parseLogoPlacementAssistResponse,
  parseTraceSettingsAssistResponse,
  parseTumblerAutoSizeResponse,
  parseTumblerItemLookupResponse,
} from "./adminApi.schema.ts";

test("admin api tumbler auto-size schema parses a valid response", () => {
  const parsed = parseTumblerAutoSizeResponse({
    analysis: {
      productType: "tumbler",
      brand: "Stanley",
      model: "Quencher",
      capacityOz: 40,
      hasHandle: true,
      shapeType: "straight",
      confidence: 0.9,
      searchQuery: "stanley quencher 40oz",
      notes: [],
    },
    suggestion: {
      productType: "tumbler",
      brand: "Stanley",
      model: "Quencher",
      capacityOz: 40,
      hasHandle: true,
      shapeType: "straight",
      overallHeightMm: 273.8,
      outsideDiameterMm: 99.8,
      topDiameterMm: 99.8,
      bottomDiameterMm: 78.7,
      usableHeightMm: 216,
      confidence: 0.9,
      sources: [],
      notes: [],
    },
    calculation: {
      shapeType: "straight",
      templateWidthMm: 313.6,
      templateHeightMm: 216,
      diameterUsedMm: 99.8,
      averageDiameterMm: 99.8,
    },
    confidenceLevel: "high",
  });
  assert.ok(parsed);
  assert.equal(parsed?.calculation.templateHeightMm, 216);
});

test("admin api tumbler item lookup schema rejects malformed envelopes", () => {
  const parsed = parseTumblerItemLookupResponse({
    lookupInput: "stanley",
    glbPath: "/models/generated/stanley.glb",
  });
  assert.equal(parsed, null);
});

test("admin api body reference glb schema accepts generated reviewed model status", () => {
  const parsed = parseBodyReferenceGlbResponse({
    glbPath: "/api/admin/models/generated/stanley-cutout.glb",
    auditJsonPath: "C:/tmp/generated-models/stanley-cutout.audit.json",
    modelStatus: "generated-reviewed-model",
    renderMode: "body-cutout-qa",
    generatedSourceSignature: "abc123",
    modelSourceLabel: "Generated from accepted BODY REFERENCE cutout",
    bodyGeometrySource: "approved contour -> mirrored body profile -> revolved body_mesh",
    lidGeometrySource: "excluded in BODY CUTOUT QA mode",
    ringGeometrySource: "excluded in BODY CUTOUT QA mode",
    meshNames: ["body_mesh"],
    fallbackMeshNames: [],
    bodyMeshBounds: {
      minMm: { x: -44, y: 0, z: -44 },
      maxMm: { x: 44, y: 225, z: 44 },
      sizeMm: { x: 88, y: 225, z: 88 },
    },
    silhouetteAudit: {
      authority: "body-cutout-qa-silhouette",
      scaleContract: "canonical sample radiusMm",
      pass: true,
      toleranceMm: 0.35,
      maxDeviationMm: 0.04,
      meanDeviationMm: 0.01,
      approvedWidthMm: 88,
      meshWidthMm: 88,
      widthDeviationMm: 0,
      approvedHeightMm: 225,
      meshHeightMm: 225,
      heightDeviationMm: 0,
      wrapDiameterMm: 88,
      frontVisibleWidthMm: 88,
      approvedContourCount: 96,
      meshRowCount: 96,
      sampleCount: 96,
      rows: [
        {
          yOverallMm: 0,
          approvedRadiusMm: 44,
          meshRadiusMm: 44,
          deviationMm: 0,
        },
      ],
      artifactPaths: {
        jsonPath: "tmp/audit/example.json",
        svgPath: "tmp/audit/example.svg",
      },
    },
    bodyGeometryContract: {
      contractVersion: "2026-04-20-v1",
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "source-sha-256",
        widthPx: 420,
        heightPx: 840,
        viewBox: "0 0 420 840",
        detectedBodyOnly: true,
      },
      glb: {
        path: "/api/admin/models/generated/stanley-cutout.glb",
        hash: "glb-sha-256",
        sourceHash: "source-sha-256",
        generatedAt: "2026-04-20T12:00:00.000Z",
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
        bodyBounds: {
          width: 88,
          height: 225,
          depth: 88,
        },
        bodyBoundsUnits: "mm",
        wrapDiameterMm: 88,
        wrapWidthMm: 276.46,
        frontVisibleWidthMm: 88,
        expectedBodyWidthMm: 88,
        expectedBodyHeightMm: 225,
        printableTopMm: 0,
        printableBottomMm: 225,
        scaleSource: "mesh-bounds",
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    },
  });

  assert.ok(parsed);
  assert.equal(parsed?.auditJsonPath, "C:/tmp/generated-models/stanley-cutout.audit.json");
  assert.equal(parsed?.modelStatus, "generated-reviewed-model");
  assert.equal(parsed?.renderMode, "body-cutout-qa");
  assert.equal(parsed?.bodyGeometryContract?.glb.hash, "glb-sha-256");
  assert.equal(parsed?.bodyGeometryContract?.dimensionsMm.scaleSource, "mesh-bounds");
});

test("admin api body geometry audit schema parses generated audit sidecars", () => {
  const parsed = parseBodyGeometryAuditArtifact({
    contractVersion: "2026-04-20-v1",
    generatedAt: "2026-04-20T12:00:00.000Z",
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      filename: "stanley-body-reference.svg",
      hash: "source-sha-256",
      widthPx: 420,
      heightPx: 840,
      viewBox: "0 0 420 840",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/stanley-cutout.glb",
      name: "stanley-cutout.glb",
      hash: "glb-sha-256",
      sourceHash: "source-sha-256",
      generatedAt: "2026-04-20T12:00:00.000Z",
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
      bodyBounds: {
        width: 88,
        height: 225,
        depth: 88,
      },
      bodyBoundsUnits: "mm",
      wrapDiameterMm: 88,
      wrapWidthMm: 276.46,
      scaleSource: "mesh-bounds",
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
  assert.equal(parsed?.glb.sourceHash, "source-sha-256");
  assert.equal(parsed?.validation.status, "pass");
  assert.equal(parsed?.dimensionsMm.scaleSource, "mesh-bounds");
  assert.equal(parsed?.svgQuality?.expectedBridgeSegmentCount, 2);
});

test("admin api auxiliary schemas validate lookup and assist payloads", () => {
  assert.ok(parseFlatItemLookupResponse({
    lookupInput: "zippo lighter",
    resolvedUrl: null,
    title: null,
    brand: null,
    label: "Zippo",
    matchedItemId: null,
    familyKey: "lighter",
    category: "accessory",
    widthMm: 38,
    heightMm: 57,
    thicknessMm: 13,
    material: "metal",
    materialLabel: "Metal",
    imageUrl: null,
    imageUrls: [],
    glbPath: "",
    modelStrategy: "family-generated",
    modelSourceUrl: null,
    requiresReview: false,
    isProxy: false,
    traceScore: null,
    traceDebug: null,
    confidence: 0.8,
    mode: "safe-fallback",
    notes: [],
    sources: [],
  }));
  assert.ok(parseLogoPlacementAssistResponse({
    detected: true,
    logoBox: { x: 1, y: 2, w: 3, h: 4 },
    viewClass: "front",
    confidence: 0.8,
    rationale: "Detected from the front photo.",
  }));
  assert.ok(parseTraceSettingsAssistResponse({
    traceMode: "bitmap-trace",
    traceRecipe: {},
    backgroundStrategy: "alpha-mask",
    preserveText: false,
    thresholdMode: "auto",
    threshold: 0.5,
    invert: false,
    turdSize: 2,
    alphaMax: 1,
    optTolerance: 0.2,
    posterizeSteps: 4,
    confidence: 0.7,
    rationale: "Default trace settings.",
  }));
});
