import assert from "node:assert/strict";
import test from "node:test";

import type { EditableBodyOutline } from "../types/productTemplate.ts";
import {
  buildBodyReferenceSvgQualityReport,
  buildBodyReferenceSvgQualityReportFromOutline,
  buildBodyReferenceSvgQualityVisualization,
  summarizeBodyReferenceSvgCutoutLineageForOperator,
  summarizeBodyReferenceSvgQualityForOperator,
  summarizeBodyReferenceSvgCutoutLineage,
} from "./bodyReferenceSvgQuality.ts";
import {
  nudgeOutlinePoint,
} from "./bodyReferenceFineTune.ts";

function makeOutline(): EditableBodyOutline {
  return {
    closed: true,
    version: 1,
    sourceContourMode: "body-only",
    points: [
      { id: "top", x: 49.9, y: 28, pointType: "corner", role: "topOuter" },
      { id: "body", x: 49.9, y: 45, pointType: "smooth", role: "body" },
      { id: "base", x: 37.4, y: 273.8, pointType: "corner", role: "base" },
    ],
    directContour: [
      { x: 49.9, y: 28 },
      { x: 49.9, y: 31.1 },
      { x: 49.9, y: 45 },
      { x: 49, y: 70 },
      { x: 48, y: 100 },
      { x: 46, y: 130 },
      { x: 44, y: 160 },
      { x: 42, y: 190 },
      { x: 40, y: 220 },
      { x: 38, y: 250 },
      { x: 37.4, y: 272.3 },
      { x: 37.4, y: 273.8 },
      { x: -37.4, y: 273.8 },
      { x: -37.4, y: 272.3 },
      { x: -38, y: 250 },
      { x: -40, y: 220 },
      { x: -42, y: 190 },
      { x: -44, y: 160 },
      { x: -46, y: 130 },
      { x: -48, y: 100 },
      { x: -49, y: 70 },
      { x: -49.9, y: 45 },
      { x: -49.9, y: 31.1 },
      { x: -49.9, y: 28 },
    ],
  };
}

test("clean closed contour passes", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 220 },
      { x: 0, y: 220 },
    ],
    closed: true,
    contourSource: "direct-contour",
    boundsUnits: "mm",
    sourceHash: "sha256:contour",
  });

  assert.equal(report.status, "pass");
  assert.equal(report.appearsBodyOnly, true);
  assert.equal(report.bodyOnlyConfidence, "high");
  assert.deepEqual(report.bodyOnlyReasonCodes, []);
  assert.equal(report.pointCount, 4);
  assert.equal(report.segmentCount, 4);
  assert.equal(report.closed, true);
  assert.equal(report.expectedBridgeSegmentCount, 0);
  assert.deepEqual(report.bounds, {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 220,
    width: 100,
    height: 220,
  });
  assert.equal(report.sourceHash, "sha256:contour");
});

test("missing contour fails", () => {
  const report = buildBodyReferenceSvgQualityReport({});

  assert.equal(report.status, "fail");
  assert.equal(report.appearsBodyOnly, false);
  assert.equal(report.bodyOnlyConfidence, "low");
  assert.ok(report.bodyOnlyReasonCodes?.includes("quality-failed"));
  assert.match(report.errors.join(" "), /Approved contour is missing/i);
});

test("too few points fails", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    closed: false,
  });

  assert.equal(report.status, "fail");
  assert.match(report.errors.join(" "), /fewer than 3 usable points/i);
});

test("invalid point fails", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 50 },
      { x: 20, y: 100 },
    ],
    closed: false,
  });

  assert.equal(report.status, "fail");
  assert.match(report.errors.join(" "), /invalid numeric point/i);
});

test("duplicate points warn", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 220 },
      { x: 0, y: 220 },
    ],
    closed: true,
  });

  assert.equal(report.status, "warn");
  assert.equal(report.duplicatePointCount, 1);
  assert.match(report.warnings.join(" "), /duplicate adjacent point/i);
});

test("near-duplicate points warn", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 110 },
      { x: 100.01, y: 110.01 },
      { x: 100, y: 220 },
      { x: 0, y: 220 },
    ],
    closed: true,
  });

  assert.equal(report.status, "warn");
  assert.equal(report.appearsBodyOnly, false);
  assert.equal(report.bodyOnlyConfidence, "low");
  assert.ok(report.bodyOnlyReasonCodes?.includes("near-duplicate-points"));
  assert.equal(report.nearDuplicatePointCount, 1);
  assert.match(report.warnings.join(" "), /near-duplicate adjacent point pair/i);
});

test("tiny segments warn", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.1 },
      { x: 100, y: 0 },
      { x: 100, y: 220 },
      { x: 0, y: 220 },
    ],
    closed: true,
  });

  assert.equal(report.status, "warn");
  assert.ok(report.tinySegmentCount >= 1);
  assert.match(report.warnings.join(" "), /tiny segment/i);
});

test("suspicious jump warns", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 250, y: 0 },
      { x: 250, y: 220 },
      { x: 0, y: 220 },
    ],
    closed: true,
  });

  assert.equal(report.status, "warn");
  assert.equal(report.appearsBodyOnly, false);
  assert.equal(report.bodyOnlyConfidence, "low");
  assert.ok(report.bodyOnlyReasonCodes?.includes("suspicious-jump"));
  assert.ok(report.suspiciousJumpCount >= 1);
  assert.equal(report.expectedBridgeSegmentCount, 0);
  assert.match(report.warnings.join(" "), /suspicious large jump/i);
});

test("closed full-body silhouette bridges are excluded from suspicious jump warnings", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 49.9, y: 28 },
      { x: 49.9, y: 31.1 },
      { x: 49.9, y: 45 },
      { x: 49, y: 70 },
      { x: 48, y: 100 },
      { x: 46, y: 130 },
      { x: 44, y: 160 },
      { x: 42, y: 190 },
      { x: 40, y: 220 },
      { x: 38, y: 250 },
      { x: 37.4, y: 272.3 },
      { x: 37.4, y: 273.8 },
      { x: -37.4, y: 273.8 },
      { x: -37.4, y: 272.3 },
      { x: -38, y: 250 },
      { x: -40, y: 220 },
      { x: -42, y: 190 },
      { x: -44, y: 160 },
      { x: -46, y: 130 },
      { x: -48, y: 100 },
      { x: -49, y: 70 },
      { x: -49.9, y: 45 },
      { x: -49.9, y: 31.1 },
      { x: -49.9, y: 28 },
    ],
    closed: true,
  });

  assert.equal(report.status, "pass");
  assert.equal(report.appearsBodyOnly, true);
  assert.equal(report.bodyOnlyConfidence, "high");
  assert.equal(report.suspiciousJumpCount, 0);
  assert.equal(report.expectedBridgeSegmentCount, 2);
  assert.doesNotMatch(report.warnings.join(" "), /suspicious large jump/i);
});

test("rounded bottom closure counts as an expected body-only bridge without widening geometry", () => {
  const points = [
    { x: 44.5, y: 15 },
    { x: 44.5, y: 25 },
    { x: 44.5, y: 32.4 },
    { x: 43.9, y: 40.2 },
    { x: 43.9, y: 47.6 },
    { x: 43.9, y: 55 },
    { x: 43.9, y: 62.9 },
    { x: 43.9, y: 70.2 },
    { x: 43.9, y: 77.6 },
    { x: 43.9, y: 85 },
    { x: 43.9, y: 92.9 },
    { x: 43.9, y: 100.2 },
    { x: 43.9, y: 107.6 },
    { x: 43.9, y: 115.5 },
    { x: 43.9, y: 122.8 },
    { x: 43.9, y: 130.2 },
    { x: 43.9, y: 138.1 },
    { x: 42.2, y: 145.5 },
    { x: 40.3, y: 152.8 },
    { x: 38.7, y: 160.7 },
    { x: 38.1, y: 168.1 },
    { x: 37.6, y: 175.4 },
    { x: 37.1, y: 183.3 },
    { x: 36.6, y: 190.7 },
    { x: 36, y: 198.1 },
    { x: 35.5, y: 205.4 },
    { x: 35.3, y: 213.3 },
    { x: 35, y: 220.7 },
    { x: 34.5, y: 228 },
    { x: 32, y: 235.9 },
    { x: 15.7, y: 243.3 },
    { x: -15.7, y: 243.3 },
    { x: -32, y: 235.9 },
    { x: -34.5, y: 228 },
    { x: -35, y: 220.7 },
    { x: -35.3, y: 213.3 },
    { x: -35.5, y: 205.4 },
    { x: -36, y: 198.1 },
    { x: -36.6, y: 190.7 },
    { x: -37.1, y: 183.3 },
    { x: -37.6, y: 175.4 },
    { x: -38.1, y: 168.1 },
    { x: -38.7, y: 160.7 },
    { x: -40.3, y: 152.8 },
    { x: -42.2, y: 145.5 },
    { x: -43.9, y: 138.1 },
    { x: -43.9, y: 130.2 },
    { x: -43.9, y: 122.8 },
    { x: -43.9, y: 115.5 },
    { x: -43.9, y: 107.6 },
    { x: -43.9, y: 100.2 },
    { x: -43.9, y: 92.9 },
    { x: -43.9, y: 85 },
    { x: -43.9, y: 77.6 },
    { x: -43.9, y: 70.2 },
    { x: -43.9, y: 62.9 },
    { x: -43.9, y: 55 },
    { x: -43.9, y: 47.6 },
    { x: -43.9, y: 40.2 },
    { x: -44.4, y: 32.4 },
    { x: -44.4, y: 25 },
    { x: -44.4, y: 15 },
  ];
  const report = buildBodyReferenceSvgQualityReport({
    points,
    closed: true,
  });
  const visualization = buildBodyReferenceSvgQualityVisualization({
    points,
    closed: true,
  });

  assert.equal(report.status, "pass");
  assert.equal(report.suspiciousJumpCount, 0);
  assert.equal(report.expectedBridgeSegmentCount, 2);
  assert.equal(visualization.expectedBridgeSegments.length, 2);
  assert.ok(visualization.expectedBridgeSegments.some((segment) => segment.from.y === 15 && segment.to.y === 15));
  assert.ok(visualization.expectedBridgeSegments.some((segment) => segment.from.y === 243.3 && segment.to.y === 243.3));
  assert.equal(report.bounds?.maxX, 44.5);
  assert.equal(report.bounds?.minX, -44.4);
});

test("draft svg quality updates after a point move", () => {
  const outline = makeOutline();
  const moved = nudgeOutlinePoint({
    outline,
    pointId: "body",
    deltaX: 3,
    deltaY: 0,
    overallHeightMm: 320,
  });

  const report = buildBodyReferenceSvgQualityReportFromOutline({ outline: moved });
  assert.ok(report.bounds);
  assert.ok(report.bounds!.maxX > 49.9);
});

test("expected bridge segment count remains visible after a safe draft edit", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 49.9, y: 28 },
      { x: 49.9, y: 31.1 },
      { x: 49.9, y: 45 },
      { x: 49, y: 70 },
      { x: 48, y: 100 },
      { x: 46, y: 130 },
      { x: 44, y: 160 },
      { x: 43, y: 175 },
      { x: 42, y: 190 },
      { x: 40, y: 220 },
      { x: 38, y: 250 },
      { x: 37.4, y: 272.3 },
      { x: 37.4, y: 273.8 },
      { x: -37.4, y: 273.8 },
      { x: -37.4, y: 272.3 },
      { x: -38, y: 250 },
      { x: -40, y: 220 },
      { x: -42, y: 190 },
      { x: -43, y: 175 },
      { x: -44, y: 160 },
      { x: -46, y: 130 },
      { x: -48, y: 100 },
      { x: -49, y: 70 },
      { x: -49.9, y: 45 },
      { x: -49.9, y: 31.1 },
      { x: -49.9, y: 28 },
    ],
    closed: true,
  });

  assert.equal(report.expectedBridgeSegmentCount, 2);
  assert.equal(report.suspiciousJumpCount, 0);
});

test("collapsed draft contour reports a fail state", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 40, y: 10 },
      { x: 40, y: 30 },
      { x: 40, y: 60 },
    ],
    closed: false,
  });

  assert.equal(report.status, "fail");
  assert.match(report.errors.join(" "), /near-zero/i);
});

test("open contour with a long jump still warns", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 0, y: 40 },
      { x: 140, y: 40 },
      { x: 140, y: 220 },
    ],
    closed: false,
  });

  assert.equal(report.status, "warn");
  assert.ok(report.suspiciousJumpCount >= 1);
  assert.equal(report.expectedBridgeSegmentCount, 0);
  assert.match(report.warnings.join(" "), /suspicious large jump/i);
});

test("diagonal long jump near the middle stays suspicious", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 5, y: 10 },
      { x: 200, y: 120 },
      { x: 205, y: 125 },
      { x: 205, y: 220 },
      { x: 0, y: 220 },
    ],
    closed: true,
  });

  assert.equal(report.status, "warn");
  assert.ok(report.suspiciousJumpCount >= 1);
  assert.equal(report.expectedBridgeSegmentCount, 0);
  assert.match(report.warnings.join(" "), /suspicious large jump/i);
});

test("near-edge horizontal jumps that do not span enough width stay suspicious", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 12 },
      { x: 35, y: 12 },
      { x: 35, y: 220 },
      { x: 200, y: 220 },
      { x: 200, y: 0 },
    ],
    closed: true,
  });

  assert.equal(report.status, "warn");
  assert.ok(report.suspiciousJumpCount >= 1);
  assert.equal(report.expectedBridgeSegmentCount, 0);
  assert.match(report.warnings.join(" "), /suspicious large jump/i);
});

test("suspicious spike warns", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 62, y: 80 },
      { x: 64, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 240 },
      { x: 0, y: 240 },
    ],
    closed: true,
  });

  assert.equal(report.status, "warn");
  assert.ok(report.suspiciousSpikeCount >= 1);
  assert.match(report.warnings.join(" "), /suspicious spike point/i);
});

test("deterministic report stays identical for the same input", () => {
  const input = {
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 220 },
      { x: 0, y: 220 },
    ],
    closed: true,
    contourSource: "direct-contour" as const,
    boundsUnits: "mm" as const,
    sourceHash: "sha256:contour",
    viewBox: "0 0 100 220",
  };

  assert.deepEqual(
    buildBodyReferenceSvgQualityReport(input),
    buildBodyReferenceSvgQualityReport(input),
  );
});

test("open contour warns but does not fail when the shape is otherwise usable", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 220 },
      { x: 0, y: 220 },
    ],
    closed: false,
  });

  assert.equal(report.status, "warn");
  assert.equal(report.closed, false);
  assert.equal(report.appearsBodyOnly, false);
  assert.equal(report.bodyOnlyConfidence, "low");
  assert.ok(report.bodyOnlyReasonCodes?.includes("open-contour"));
  assert.match(report.warnings.join(" "), /Contour is open/i);
});

test("bounds are calculated correctly", () => {
  const report = buildBodyReferenceSvgQualityReport({
    points: [
      { x: -20, y: 10 },
      { x: 80, y: 10 },
      { x: 50, y: 180 },
      { x: -30, y: 150 },
    ],
    closed: true,
  });

  assert.deepEqual(report.bounds, {
    minX: -30,
    minY: 10,
    maxX: 80,
    maxY: 180,
    width: 110,
    height: 170,
  });
});

test("unsupported path-only inputs report quality as unavailable instead of inventing sampled points", () => {
  const report = buildBodyReferenceSvgQualityReport({
    pathSvg: "M0,0 C10,10 20,20 30,30 Z",
    closed: true,
  });

  assert.equal(report.status, "warn");
  assert.match(report.warnings.join(" "), /sampled contour points were not provided/i);
});

test("outline helper uses the regularized approved direct contour used by reviewed GLB generation", () => {
  const report = buildBodyReferenceSvgQualityReportFromOutline({
    outline: {
      closed: true,
      version: 1,
      points: [
        { id: "top", x: 45, y: 0, pointType: "corner", role: "topOuter" },
        { id: "body", x: 45, y: 80, pointType: "corner", role: "body" },
        { id: "shoulder", x: 43, y: 155, pointType: "corner", role: "shoulder" },
        { id: "lowerTaper", x: 35, y: 190, pointType: "corner", role: "lowerTaper" },
        { id: "bevel", x: 18, y: 214, pointType: "corner", role: "bevel" },
        { id: "base", x: 8, y: 220, pointType: "corner", role: "base" },
      ],
      directContour: [
        { x: 45, y: 0 },
        { x: 45, y: 80 },
        { x: 43, y: 155 },
        { x: 35, y: 190 },
        { x: 18, y: 214 },
        { x: 8, y: 220 },
        { x: -8, y: 220 },
        { x: -18, y: 214 },
        { x: -35, y: 190 },
        { x: -43, y: 155 },
        { x: -45, y: 80 },
        { x: -45, y: 0 },
      ],
      sourceContour: [
        { x: 100, y: 10 },
        { x: 200, y: 10 },
        { x: 220, y: 400 },
        { x: 80, y: 400 },
      ],
      sourceContourViewport: {
        minX: 0,
        minY: 0,
        width: 300,
        height: 500,
      },
      sourceContourMode: "body-only",
    },
    sourceHash: "sha256:approved",
  });

  assert.equal(report.contourSource, "direct-contour");
  assert.equal(report.boundsUnits, "mm");
  assert.equal(report.sourceHash, "sha256:approved");
  assert.deepEqual(report.bounds, {
    minX: -45,
    minY: 0,
    maxX: 45,
    maxY: 209,
    width: 90,
    height: 209,
  });
});

test("outline helper rebuilds manual body-only contours from saved points when cached direct contours are stale", () => {
  const report = buildBodyReferenceSvgQualityReportFromOutline({
    outline: {
      closed: true,
      version: 1,
      sourceContourMode: "body-only",
      points: [
        { id: "top", x: 54, y: 31.1, pointType: "corner", role: "topOuter" },
        { id: "body", x: 54, y: 100, pointType: "smooth", role: "body" },
        { id: "base", x: 38.1, y: 172.7, pointType: "corner", role: "base" },
      ],
      directContour: [
        { x: 43.2, y: 31.1 },
        { x: 43.2, y: 100 },
        { x: 38.1, y: 172.7 },
        { x: -38.1, y: 172.7 },
        { x: -43.2, y: 100 },
        { x: -43.2, y: 31.1 },
      ],
    },
  });

  assert.equal(report.contourSource, "outline-points");
  assert.equal(report.boundsUnits, "mm");
  assert.ok(report.bounds);
  assert.equal(report.bounds.maxX, 54);
  assert.equal(report.bounds.minX, -54);
});

test("cutout lineage keeps corrected drafts non-authoritative until accepted", () => {
  const lineage = summarizeBodyReferenceSvgCutoutLineage({
    hasAcceptedCutout: true,
    hasReviewedGlb: true,
    acceptedSourceHash: "accepted-source",
    correctedDraftSourceHash: "corrected-draft-source",
    reviewedGlbSourceHash: "accepted-source",
    svgQualityStatus: "pass",
  });

  assert.equal(lineage.status, "draft-pending");
  assert.equal(lineage.acceptedCutoutAuthoritative, true);
  assert.equal(lineage.correctedDraftAuthoritative, false);
  assert.equal(lineage.hasPendingCorrectedDraft, true);
  assert.equal(lineage.requiresReviewedGlbRegeneration, false);
  assert.equal(lineage.blocksReviewedGlbGeneration, true);
  assert.match(lineage.warnings.join(" "), /pending acceptance/i);

  const operatorSummary = summarizeBodyReferenceSvgCutoutLineageForOperator(lineage);
  assert.equal(operatorSummary.stateLabel, "Corrected draft pending");
  assert.match(operatorSummary.acceptedSourceLabel, /Accepted source remains authoritative/i);
  assert.match(operatorSummary.correctedDraftLabel, /not authoritative/i);
  assert.match(operatorSummary.nextActionLabel, /Accept corrected cutout/i);
});

test("operator summary waits for BODY REFERENCE before assessing missing cutout quality", () => {
  const missingReport = buildBodyReferenceSvgQualityReport({});
  const operatorSummary = summarizeBodyReferenceSvgQualityForOperator(missingReport, {
    hasAcceptedCutout: false,
  });

  assert.equal(missingReport.status, "fail");
  assert.equal(operatorSummary.statusLabel, "Waiting for BODY REFERENCE");
  assert.equal(operatorSummary.statusTone, "unknown");
  assert.equal(operatorSummary.bodyOnlyConfidenceLabel, "not assessed");
  assert.equal(operatorSummary.generationBlocked, false);
  assert.doesNotMatch(operatorSummary.operatorFixHint ?? "", /fine-tune/i);
  assert.match(operatorSummary.bodyOnlySummary, /accept BODY REFERENCE before SVG cutout quality is assessed/i);
});

test("cutout lineage requires regeneration after accepted source hash changes", () => {
  const lineage = summarizeBodyReferenceSvgCutoutLineage({
    hasAcceptedCutout: true,
    hasReviewedGlb: true,
    acceptedSourceHash: "accepted-source-v2",
    reviewedGlbSourceHash: "accepted-source-v1",
    svgQualityStatus: "pass",
  });

  assert.equal(lineage.status, "reviewed-glb-stale");
  assert.equal(lineage.acceptedCutoutAuthoritative, true);
  assert.equal(lineage.hasPendingCorrectedDraft, false);
  assert.equal(lineage.requiresReviewedGlbRegeneration, true);
  assert.equal(lineage.blocksReviewedGlbGeneration, false);
  assert.match(lineage.warnings.join(" "), /newer than the reviewed BODY CUTOUT QA GLB/i);

  const operatorSummary = summarizeBodyReferenceSvgCutoutLineageForOperator(lineage);
  assert.equal(operatorSummary.stateLabel, "Reviewed GLB stale");
  assert.match(operatorSummary.reviewedGlbLabel, /stale/i);
  assert.match(operatorSummary.nextActionLabel, /Regenerate BODY CUTOUT QA GLB/i);
});

test("cutout lineage blocks generation when accepted SVG quality fails", () => {
  const lineage = summarizeBodyReferenceSvgCutoutLineage({
    hasAcceptedCutout: true,
    hasReviewedGlb: false,
    acceptedSourceHash: "accepted-source",
    svgQualityStatus: "fail",
  });

  assert.equal(lineage.status, "quality-failed");
  assert.equal(lineage.requiresReviewedGlbRegeneration, false);
  assert.equal(lineage.blocksReviewedGlbGeneration, true);
  assert.match(lineage.errors.join(" "), /quality is failing/i);

  const operatorSummary = summarizeBodyReferenceSvgQualityForOperator(
    buildBodyReferenceSvgQualityReport({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      closed: false,
    }),
  );
  assert.equal(operatorSummary.statusLabel, "FAIL");
  assert.equal(operatorSummary.generationBlocked, true);
  assert.match(operatorSummary.generationBlockedReason ?? "", /blocked/i);
  assert.match(operatorSummary.operatorFixHint ?? "", /fine-tune/i);
  assert.ok(operatorSummary.reasonLabels.some((label) => /fewer than 3 usable points/i.test(label)));
});

test("operator summary preserves pass and warn labels after cutout acceptance", () => {
  const passSummary = summarizeBodyReferenceSvgQualityForOperator(
    buildBodyReferenceSvgQualityReport({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 220 },
        { x: 0, y: 220 },
      ],
      closed: true,
    }),
    { hasAcceptedCutout: true },
  );

  const warnSummary = summarizeBodyReferenceSvgQualityForOperator(
    buildBodyReferenceSvgQualityReport({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 110 },
        { x: 100.01, y: 110.01 },
        { x: 100, y: 220 },
        { x: 0, y: 220 },
      ],
      closed: true,
    }),
    { hasAcceptedCutout: true },
  );

  assert.equal(passSummary.statusLabel, "PASS");
  assert.equal(passSummary.generationBlocked, false);
  assert.equal(warnSummary.statusLabel, "WARN");
  assert.equal(warnSummary.statusTone, "warn");
});

test("cutout lineage reports fresh reviewed GLB when accepted source hash matches", () => {
  const lineage = summarizeBodyReferenceSvgCutoutLineage({
    hasAcceptedCutout: true,
    hasReviewedGlb: true,
    acceptedSourceHash: "accepted-source",
    reviewedGlbSourceHash: "accepted-source",
    svgQualityStatus: "pass",
  });

  assert.equal(lineage.status, "reviewed-glb-current");
  assert.equal(lineage.requiresReviewedGlbRegeneration, false);
  assert.equal(lineage.blocksReviewedGlbGeneration, false);
  assert.deepEqual(lineage.warnings, []);
  assert.deepEqual(lineage.errors, []);
});
