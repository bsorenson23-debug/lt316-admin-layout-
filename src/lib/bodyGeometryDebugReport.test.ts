import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyBodyGeometryContract } from "./bodyGeometryContract.ts";
import {
  BODY_GEOMETRY_DEBUG_REPORT_VERSION,
  buildBodyGeometryDebugReport,
  buildBodyGeometryDebugReportFileName,
} from "./bodyGeometryDebugReport.ts";

test("buildBodyGeometryDebugReport bundles contract and audit metadata without SVG or GLB binaries", () => {
  const contract = {
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa" as const,
    source: {
      type: "approved-svg" as const,
      filename: "stanley-body.svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/stanley-cutout.glb",
      hash: "sha256:glb",
      freshRelativeToSource: true,
    },
    meshes: {
      ...createEmptyBodyGeometryContract().meshes,
      names: ["body_mesh"],
      bodyMeshNames: ["body_mesh"],
    },
    validation: {
      status: "pass" as const,
      errors: [],
      warnings: [],
    },
    svgQuality: {
      status: "pass" as const,
      contourSource: "direct-contour" as const,
      boundsUnits: "mm" as const,
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
      ...createEmptyBodyGeometryContract().runtimeInspection,
      status: "complete" as const,
      source: "three-loaded-scene" as const,
      auditArtifactPresent: true,
      auditArtifactOptionalMissing: false,
      auditArtifactRequiredMissing: false,
    },
  };
  const report = buildBodyGeometryDebugReport({
    contract,
    auditArtifact: {
      contractVersion: "2026-04-20-v1",
      generatedAt: "2026-04-20T12:00:00.000Z",
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        filename: "stanley-body.svg",
        hash: "sha256:source",
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
      dimensionsMm: {},
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
    },
    exportedAt: "2026-04-20T13:00:00.000Z",
    environment: {
      appVersion: "0.1.0",
      gitCommit: "abc123",
      pathname: "/admin",
      href: "http://localhost:3000/admin?debug=1",
      userAgent: "CodexTest/1.0",
      featureFlags: {
        adminDebug: true,
        showBodyContractInspector: true,
        allowInvalidBodyCutoutQaApproval: false,
      },
    },
  });

  assert.equal(report.reportVersion, BODY_GEOMETRY_DEBUG_REPORT_VERSION);
  assert.equal(report.contractVersion, "2026-04-20-v1");
  assert.equal(report.timestamp, "2026-04-20T13:00:00.000Z");
  assert.equal(report.application.version, "0.1.0");
  assert.equal(report.application.gitCommit, "abc123");
  assert.equal(report.route.pathname, "/admin");
  assert.equal(report.route.href, "http://localhost:3000/admin?debug=1");
  assert.equal(report.userAgent, "CodexTest/1.0");
  assert.equal(report.featureFlags.adminDebug, true);
  assert.equal(report.summary.mode, "body-cutout-qa");
  assert.equal(report.summary.validationStatus, "pass");
  assert.equal(report.summary.hasAuditArtifact, true);
  assert.equal(report.summary.auditArtifactPresent, true);
  assert.equal(report.summary.auditArtifactOptionalMissing, false);
  assert.equal(report.summary.auditArtifactRequiredMissing, false);
  assert.equal(report.contract?.svgQuality?.expectedBridgeSegmentCount, 2);
  assert.equal(report.auditArtifact?.svgQuality?.expectedBridgeSegmentCount, 2);
  assert.equal(report.contract?.glb.hash, "sha256:glb");
  assert.equal(report.auditArtifact?.glb.sourceHash, "sha256:source");
  assert.equal("svgText" in (report.contract?.source ?? {}), false);
});

test("buildBodyGeometryDebugReportFileName uses the requested timestamp-safe filename pattern", () => {
  const fileName = buildBodyGeometryDebugReportFileName({
    exportedAt: "2026-04-20T13:05:06.000Z",
  });

  assert.equal(fileName, "body-contract-debug-2026-04-20-13-05-06.json");
});
