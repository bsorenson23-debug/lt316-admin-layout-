import assert from "node:assert/strict";
import test from "node:test";

import type {
  EditableBodyOutline,
} from "../types/productTemplate.ts";
import {
  buildBodyReferenceGlbSourceSignature,
} from "./bodyReferenceGlbSource.ts";
import {
  buildBodyReferenceGuideCandidateReport,
  type BodyReferenceGuideCandidate,
  type BodyReferenceGuideCoordinateSpace,
} from "./bodyReferenceGuideCandidates.ts";
import { buildOutlineGeometrySignature } from "./bodyReferenceFineTune.ts";
import { buildBodyReferenceSvgQualityReportFromOutline } from "./bodyReferenceSvgQuality.ts";
import {
  buildBodyReferenceV2GenerationSource,
  buildBodyReferenceV2SourceHashPayload,
  summarizeBodyReferenceV2GenerationReadiness,
} from "./bodyReferenceV2GenerationSource.ts";
import {
  createBodyReferenceV2Layer,
  createCenterlineAxis,
  type BodyReferenceV2Draft,
} from "./bodyReferenceV2Layers.ts";
import { buildWrapExportPreviewState } from "./wrapExportPreviewState.ts";

function createOutline(): EditableBodyOutline {
  return {
    closed: true,
    version: 1,
    sourceContourMode: "body-only",
    points: [
      { id: "top", x: 50, y: 0, pointType: "corner", role: "topOuter" },
      { id: "upper", x: 50, y: 10, pointType: "corner", role: "body" },
      { id: "middle", x: 40, y: 100, pointType: "corner", role: "body" },
      { id: "lower", x: 50, y: 190, pointType: "corner", role: "body" },
      { id: "bottom", x: 50, y: 200, pointType: "corner", role: "base" },
    ],
    directContour: [
      { x: -50, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 10 },
      { x: 40, y: 100 },
      { x: 50, y: 190 },
      { x: 50, y: 200 },
      { x: -50, y: 200 },
      { x: -50, y: 190 },
      { x: -40, y: 100 },
      { x: -50, y: 10 },
    ],
  };
}

function createV2Draft(): BodyReferenceV2Draft {
  return {
    sourceImageUrl: "data:image/png;base64,guide-test",
    centerline: createCenterlineAxis({
      id: "centerline",
      xPx: 100,
      topYPx: 10,
      bottomYPx: 210,
      source: "operator",
    }),
    layers: [
      createBodyReferenceV2Layer({
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: 84, yPx: 20 },
          { xPx: 78, yPx: 120 },
          { xPx: 82, yPx: 205 },
        ],
      }),
    ],
    blockedRegions: [],
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
      resolvedDiameterMm: 88.9,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      expectedBodyHeightMm: 185,
      expectedBodyWidthMm: 88.9,
    },
  };
}

function createGlbSourceInput(outline: EditableBodyOutline) {
  return {
    renderMode: "body-cutout-qa",
    matchedProfileId: "guide-test",
    bodyOutline: outline,
    canonicalBodyProfile: {
      symmetrySource: "front-axis",
      mirroredFromSymmetrySource: true,
      axis: {
        xTop: 0,
        yTop: 0,
        xBottom: 0,
        yBottom: 200,
      },
      samples: [
        { sNorm: 0, yMm: 0, yPx: 0, xLeft: -50, radiusPx: 50, radiusMm: 44.45 },
        { sNorm: 1, yMm: 200, yPx: 200, xLeft: -50, radiusPx: 50, radiusMm: 44.45 },
      ],
      svgPath: "M -50 0 L 50 0 L 50 200 L -50 200 Z",
    },
    canonicalDimensionCalibration: {
      units: "mm",
      totalHeightMm: 200,
      bodyHeightMm: 200,
      lidBodyLineMm: 0,
      bodyBottomMm: 200,
      wrapDiameterMm: 88.9,
      baseDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      frontVisibleWidthMm: 88.9,
      frontAxisPx: {
        xTop: 0,
        yTop: 0,
        xBottom: 0,
        yBottom: 200,
      },
      photoToFrontTransform: {
        type: "identity",
        matrix: [1, 0, 0, 1, 0, 0],
      },
      svgFrontViewBoxMm: {
        x: -50,
        y: 0,
        width: 100,
        height: 200,
      },
      wrapMappingMm: {
        frontMeridianMm: 0,
        backMeridianMm: 139.65,
        leftQuarterMm: 69.82,
        rightQuarterMm: 209.47,
      },
      glbScale: {
        unitsPerMm: 1,
      },
    },
  };
}

function assertCandidateReadOnly(candidate: BodyReferenceGuideCandidate): void {
  assert.equal(candidate.readOnly, true);
  assert.equal(candidate.affectsSourceHash, false);
  assert.equal(candidate.affectsGlbInput, false);
  assert.equal(candidate.affectsBodyCutoutQa, false);
  assert.equal(candidate.affectsWrapExport, false);
  assert.equal(candidate.affectsV2Authority, false);
}

test("expected top and bottom bridge segments produce read-only guide candidates", () => {
  const outline = createOutline();
  const svgQualityReport = buildBodyReferenceSvgQualityReportFromOutline({ outline });

  const report = buildBodyReferenceGuideCandidateReport({
    outline,
    svgQualityReport,
  });

  assert.equal(svgQualityReport.status, "pass");
  assert.equal(report.status, "pass");
  assert.equal(report.expectedBridgeSegmentCount, 2);
  assert.equal(report.suspiciousJumpCount, 0);
  assert.equal(report.coordinateSpace, "millimeters");
  assert.equal(report.candidates.filter((candidate) => candidate.kind === "top-bridge").length, 1);
  assert.equal(report.candidates.filter((candidate) => candidate.kind === "bottom-bridge").length, 1);
  for (const candidate of report.candidates) {
    assertCandidateReadOnly(candidate);
  }
});

test("suspicious jumps do not become bridge guide candidates silently", () => {
  const outline = createOutline();
  const svgQualityReport = {
    ...buildBodyReferenceSvgQualityReportFromOutline({ outline }),
    status: "warn" as const,
    expectedBridgeSegmentCount: 0,
    suspiciousJumpCount: 1,
    warnings: ["Contour contains 1 suspicious large jump segment(s)."],
  };

  const report = buildBodyReferenceGuideCandidateReport({
    outline,
    svgQualityReport,
  });

  assert.equal(report.status, "warn");
  assert.equal(report.candidates.some((candidate) => candidate.kind === "top-bridge"), false);
  assert.equal(report.candidates.some((candidate) => candidate.kind === "bottom-bridge"), false);
  assert.match(report.warnings.join(" "), /Suspicious jump segments/);
});

test("missing svg quality returns unknown instead of inventing bridge guides", () => {
  const report = buildBodyReferenceGuideCandidateReport({
    outline: createOutline(),
    svgQualityReport: null,
  });

  assert.equal(report.status, "unknown");
  assert.equal(report.candidates.length, 0);
  assert.match(report.warnings.join(" "), /SVG quality report is unavailable/);
});

test("missing coordinate-space metadata does not default to millimeters", () => {
  const outline = createOutline();
  const svgQualityReport = {
    ...buildBodyReferenceSvgQualityReportFromOutline({ outline }),
    boundsUnits: "unknown" as const,
  };

  const report = buildBodyReferenceGuideCandidateReport({
    outline,
    svgQualityReport,
  });

  assert.equal(report.status, "unknown");
  assert.equal(report.coordinateSpace, "unknown");
  assert.equal(report.candidates.length, 0);
  assert.match(report.warnings.join(" "), /coordinate space is unknown/);
});

test("coordinate spaces remain explicit and distinct", () => {
  const outline = createOutline();
  const svgQualityReport = buildBodyReferenceSvgQualityReportFromOutline({ outline });
  const spaces: BodyReferenceGuideCoordinateSpace[] = [
    "raw-svg",
    "viewbox",
    "image-pixels",
    "millimeters",
  ];

  for (const coordinateSpace of spaces) {
    const report = buildBodyReferenceGuideCandidateReport({
      outline,
      svgQualityReport,
      coordinateSpace,
    });

    assert.equal(report.coordinateSpace, coordinateSpace);
    assert.ok(report.candidates.length > 0);
    assert.ok(report.candidates.every((candidate) => candidate.coordinateSpace === coordinateSpace));
  }
});

test("guide candidates are deterministic", () => {
  const outline = createOutline();
  const svgQualityReport = buildBodyReferenceSvgQualityReportFromOutline({ outline });

  const first = buildBodyReferenceGuideCandidateReport({ outline, svgQualityReport });
  const second = buildBodyReferenceGuideCandidateReport({ outline, svgQualityReport });

  assert.deepEqual(first, second);
});

test("guide derivation does not modify input outline or source hash helper output", () => {
  const outline = createOutline();
  const beforeJson = JSON.stringify(outline);
  const beforeOutlineSignature = buildOutlineGeometrySignature(outline);
  const beforeGlbSourceSignature = buildBodyReferenceGlbSourceSignature(createGlbSourceInput(outline) as never);

  buildBodyReferenceGuideCandidateReport({
    outline,
    svgQualityReport: buildBodyReferenceSvgQualityReportFromOutline({ outline }),
  });

  assert.equal(JSON.stringify(outline), beforeJson);
  assert.equal(buildOutlineGeometrySignature(outline), beforeOutlineSignature);
  assert.equal(buildBodyReferenceGlbSourceSignature(createGlbSourceInput(outline) as never), beforeGlbSourceSignature);
});

test("guide derivation does not change BODY REFERENCE v2 generation source summary", () => {
  const outline = createOutline();
  const draft = createV2Draft();
  const beforeReadiness = summarizeBodyReferenceV2GenerationReadiness(draft);
  const beforeSource = buildBodyReferenceV2GenerationSource(draft);

  buildBodyReferenceGuideCandidateReport({
    outline,
    svgQualityReport: buildBodyReferenceSvgQualityReportFromOutline({ outline }),
  });

  const afterReadiness = summarizeBodyReferenceV2GenerationReadiness(draft);
  const afterSource = buildBodyReferenceV2GenerationSource(draft);

  assert.deepEqual(afterReadiness, beforeReadiness);
  assert.deepEqual(
    afterSource ? buildBodyReferenceV2SourceHashPayload(afterSource) : null,
    beforeSource ? buildBodyReferenceV2SourceHashPayload(beforeSource) : null,
  );
});

test("guide derivation does not change WRAP / EXPORT preview state", () => {
  const outline = createOutline();
  const contract = {
    glb: {
      path: "/api/admin/models/generated/guide-test-cutout.glb",
      freshRelativeToSource: true,
    },
    dimensionsMm: {
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      printableTopMm: 0,
      printableBottomMm: 200,
      expectedBodyWidthMm: 88.9,
      expectedBodyHeightMm: 200,
      bodyBounds: {
        width: 88.9,
        height: 200,
        depth: 88.9,
      },
      scaleSource: "mesh-bounds",
    },
  };
  const before = buildWrapExportPreviewState(contract as never);

  buildBodyReferenceGuideCandidateReport({
    outline,
    svgQualityReport: buildBodyReferenceSvgQualityReportFromOutline({ outline }),
  });

  assert.deepEqual(buildWrapExportPreviewState(contract as never), before);
});
