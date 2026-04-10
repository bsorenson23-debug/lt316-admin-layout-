import assert from "node:assert/strict";
import test from "node:test";

import type { FlatItemLookupTraceDebug } from "../types/flatItemLookup.ts";
import type { EditableBodyOutline, EditableBodyOutlinePoint } from "../types/productTemplate.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import {
  createEditableBodyOutline,
  createEditableBodyOutlineFromTraceDebug,
} from "./editableBodyOutline.ts";
import {
  BODY_REFERENCE_CONTRACT_VERSION,
  createPersistedBodyReferencePipeline,
  deriveBodyReferencePipeline,
} from "./bodyReferencePipeline.ts";

const WEAK_TOP_BAND_WARNING =
  "Auto top-band detection is weak. Set printable top / bottom explicitly before saving production geometry.";

const noisyStanleyFitDebug: TumblerItemLookupFitDebug = {
  kind: "lathe-body-fit",
  sourceImageUrl: "https://example.com/stanley-quencher-front.png",
  imageWidthPx: 622,
  imageHeightPx: 724,
  silhouetteBoundsPx: {
    minX: 202,
    minY: 16,
    maxX: 419,
    maxY: 707,
  },
  centerXPx: 309.4,
  fullTopPx: 0,
  fullBottomPx: 707,
  bodyTopPx: 89.2,
  bodyBottomPx: 629.3,
  rimTopPx: 89.2,
  rimBottomPx: 139.34,
  referenceBandTopPx: 180.36,
  referenceBandBottomPx: 451.55,
  referenceBandCenterYPx: 315.96,
  referenceBandWidthPx: 214.8,
  maxCenterWidthPx: 214.8,
  referenceHalfWidthPx: 107.4,
  handleSide: "right",
  handleCenterYPx: 380,
  handleOuterWidthPx: 140,
  handleOuterHeightPx: 174,
  handleAttachEdgePx: 202,
  handleOuterEdgePx: 342,
  handleHoleTopPx: 304,
  handleHoleBottomPx: 468,
  handleBarWidthPx: 19,
  fitScore: 9.14,
  profilePoints: [
    { yPx: 89.2, yMm: 28, radiusPx: 8.8, radiusMm: 4.1 },
    { yPx: 121.1, yMm: 40.76, radiusPx: 12.41, radiusMm: 23.45 },
    { yPx: 134.78, yMm: 46.23, radiusPx: 73.4, radiusMm: 32.29 },
    { yPx: 166.68, yMm: 58.99, radiusPx: 107.33, radiusMm: 49.93 },
    { yPx: 269.23, yMm: 100, radiusPx: 107.1, radiusMm: 49.8 },
    { yPx: 451.55, yMm: 172.91, radiusPx: 106.5, radiusMm: 49.3 },
    { yPx: 524.47, yMm: 202.08, radiusPx: 83.38, radiusMm: 41.7 },
    { yPx: 629.3, yMm: 244, radiusPx: 80.2, radiusMm: 37.39 },
  ],
};

const noisyTraceDebug: FlatItemLookupTraceDebug = {
  kind: "silhouette-trace",
  sourceImageUrl: "https://example.com/stanley-trace.png",
  imageWidthPx: 420,
  imageHeightPx: 760,
  silhouetteBoundsPx: {
    minX: 150,
    minY: 0,
    maxX: 250,
    maxY: 720,
  },
  coverage: 0.31,
  traceScore: 0.94,
  accepted: true,
  rejectionReason: null,
  targetWidthMm: 100,
  targetHeightMm: 274,
  outlinePointsPx: [
    { xPx: 150, yPx: 120 },
    { xPx: 150, yPx: 20 },
    { xPx: 165, yPx: 20 },
    { xPx: 165, yPx: 0 },
    { xPx: 175, yPx: 0 },
    { xPx: 175, yPx: 20 },
    { xPx: 250, yPx: 20 },
    { xPx: 250, yPx: 120 },
    { xPx: 250, yPx: 250 },
    { xPx: 230, yPx: 380 },
    { xPx: 228, yPx: 520 },
    { xPx: 232, yPx: 640 },
    { xPx: 220, yPx: 720 },
    { xPx: 180, yPx: 720 },
    { xPx: 168, yPx: 640 },
    { xPx: 165, yPx: 520 },
    { xPx: 162, yPx: 380 },
    { xPx: 150, yPx: 250 },
  ],
};

function buildStanleyOutline(handleSide: "left" | "right" = "right"): EditableBodyOutline {
  return createEditableBodyOutline({
    overallHeightMm: 273.8,
    bodyTopFromOverallMm: 28,
    bodyBottomFromOverallMm: 244,
    diameterMm: 99.82,
    topOuterDiameterMm: 99.82,
    baseDiameterMm: 78.7,
    shoulderDiameterMm: 99.82,
    taperUpperDiameterMm: 95,
    taperLowerDiameterMm: 86,
    bevelDiameterMm: 80,
    fitDebug: {
      ...noisyStanleyFitDebug,
      handleSide,
    },
  });
}

function buildStraightWallOutline(): EditableBodyOutline {
  return createEditableBodyOutline({
    overallHeightMm: 300,
    bodyTopFromOverallMm: 30,
    bodyBottomFromOverallMm: 250,
    diameterMm: 100,
    topOuterDiameterMm: 100,
    baseDiameterMm: 100,
  });
}

function buildManualOverrideOutline(): EditableBodyOutline {
  const outline = buildStraightWallOutline();
  outline.points = outline.points.map((point) => {
    if (point.role === "topOuter" || point.role === "body" || point.role === "shoulder") {
      return { ...point, x: 54 };
    }
    return point;
  });
  return outline;
}

function sampleByNearestY(points: EditableBodyOutlinePoint[], yMm: number): EditableBodyOutlinePoint | undefined {
  return [...points].sort((a, b) => Math.abs(a.y - yMm) - Math.abs(b.y - yMm))[0];
}

test("Stanley golden fixture derives one stable contract and blocks weak top-band saves", () => {
  const outline = buildStanleyOutline();
  const pipeline = deriveBodyReferencePipeline({
    outline,
    overallHeightMm: 273.8,
    bodyTopFromOverallMm: 28,
    bodyBottomFromOverallMm: 244,
    wrapDiameterMm: 99.82,
    baseDiameterMm: 78.7,
    handleArcDeg: 90,
    handleSide: "right",
  });

  assert.ok(pipeline);
  assert.equal(pipeline?.qa.pass, false);
  assert.ok(pipeline?.warnings.includes(WEAK_TOP_BAND_WARNING));
  assert.ok(Math.abs((pipeline?.canonicalDimensionCalibration.frontVisibleWidthMm ?? 0) - 99.82) <= 0.75);

  const firstRows = pipeline?.canonicalBodyProfile.samples.slice(0, 8) ?? [];
  assert.equal(firstRows.length, 8);
  for (const row of firstRows) {
    assert.ok(row.radiusPx > 80, `expected cleaned top contour width, got ${JSON.stringify(row)}`);
    assert.ok(Math.abs(row.radiusMm - 49.91) <= 1.5, `expected top body radius to stay near Stanley diameter, got ${JSON.stringify(row)}`);
  }

  const sx = pipeline?.canonicalDimensionCalibration.photoToFrontTransform.matrix[0] ?? 0;
  const stableRow = [...(pipeline?.canonicalBodyProfile.samples ?? [])]
    .sort((left, right) => right.radiusPx - left.radiusPx)[0];
  assert.ok(stableRow);
  assert.ok(Math.abs((stableRow?.radiusPx ?? 0) * sx - (stableRow?.radiusMm ?? 0)) <= 2);
});

test("straight-wall fallback uses outline-only authority when no measurement contour exists", () => {
  const pipeline = deriveBodyReferencePipeline({
    outline: buildStraightWallOutline(),
    overallHeightMm: 300,
    bodyTopFromOverallMm: 30,
    bodyBottomFromOverallMm: 250,
    wrapDiameterMm: 100,
    baseDiameterMm: 100,
    handleArcDeg: 0,
    printableTopOverrideMm: 30,
    printableBottomOverrideMm: 250,
  });

  assert.ok(pipeline);
  assert.equal(pipeline?.qa.fallbackMode, "none");
  assert.equal(pipeline?.qa.pass, true);
  assert.deepEqual(pipeline?.warnings, []);
  assert.equal(pipeline?.canonicalDimensionCalibration.frontVisibleWidthMm, 100);
  assert.equal(
    pipeline?.canonicalDimensionCalibration.printableSurfaceContract?.circumferentialExclusions.length ?? -1,
    0,
  );
});

test("handle-left inputs switch shell sampling authority to the clean right side", () => {
  const pipeline = deriveBodyReferencePipeline({
    outline: buildStanleyOutline("left"),
    overallHeightMm: 273.8,
    bodyTopFromOverallMm: 28,
    bodyBottomFromOverallMm: 244,
    wrapDiameterMm: 99.82,
    baseDiameterMm: 78.7,
    handleArcDeg: 90,
    handleSide: "left",
    printableTopOverrideMm: 45,
    printableBottomOverrideMm: 220,
  });

  assert.ok(pipeline);
  assert.equal(pipeline?.canonicalBodyProfile.symmetrySource, "right");
  assert.equal(pipeline?.qa.pass, true);
  assert.ok(Math.abs((pipeline?.canonicalDimensionCalibration.frontVisibleWidthMm ?? 0) - 99.82) <= 0.75);
});

test("cleaned noisy trace starts the cutout at the body band instead of the contaminated top hardware", () => {
  const outline = createEditableBodyOutlineFromTraceDebug({
    traceDebug: noisyTraceDebug,
    overallHeightMm: 300,
    bodyTopFromOverallMm: 40,
    bodyBottomFromOverallMm: 260,
    diameterMm: 100,
    topOuterDiameterMm: 100,
  });
  const pipeline = deriveBodyReferencePipeline({
    outline,
    overallHeightMm: 300,
    bodyTopFromOverallMm: 40,
    bodyBottomFromOverallMm: 260,
    wrapDiameterMm: 100,
    baseDiameterMm: 76,
    printableTopOverrideMm: 48,
    printableBottomOverrideMm: 250,
  });

  assert.ok(pipeline);
  assert.equal(pipeline?.qa.pass, true);
  assert.ok((pipeline?.canonicalBodyProfile.axis.yTop ?? 0) > 80);
  assert.ok((pipeline?.canonicalDimensionCalibration.frontVisibleWidthMm ?? 0) >= 95);
});

test("manual BODY REFERENCE outline overrides remain authoritative through persisted reload", () => {
  const live = deriveBodyReferencePipeline({
    outline: buildManualOverrideOutline(),
    overallHeightMm: 300,
    bodyTopFromOverallMm: 30,
    bodyBottomFromOverallMm: 250,
    wrapDiameterMm: 108,
    baseDiameterMm: 100,
    printableTopOverrideMm: 36,
    printableBottomOverrideMm: 242,
  });

  assert.ok(live);
  assert.equal(live?.qa.pass, true);
  assert.ok(Math.abs((live?.canonicalDimensionCalibration.frontVisibleWidthMm ?? 0) - 108) <= 0.75);

  const reloaded = createPersistedBodyReferencePipeline({
    outline: live?.outline,
    canonicalBodyProfile: live?.canonicalBodyProfile,
    canonicalDimensionCalibration: live?.canonicalDimensionCalibration,
    printableSurfaceResolution: live?.printableSurfaceResolution,
    bodyReferenceQA: live?.qa,
    bodyReferenceWarnings: live?.warnings,
    bodyReferenceContractVersion: BODY_REFERENCE_CONTRACT_VERSION,
  });

  assert.ok(reloaded);
  assert.deepEqual(reloaded?.canonicalBodyProfile, live?.canonicalBodyProfile);
  assert.deepEqual(reloaded?.canonicalDimensionCalibration, live?.canonicalDimensionCalibration);
  assert.deepEqual(reloaded?.printableSurfaceResolution, live?.printableSurfaceResolution);
});

test("persisted BODY REFERENCE artifacts are rejected when the contract version is stale", () => {
  const live = deriveBodyReferencePipeline({
    outline: buildManualOverrideOutline(),
    overallHeightMm: 300,
    bodyTopFromOverallMm: 30,
    bodyBottomFromOverallMm: 250,
    wrapDiameterMm: 108,
    baseDiameterMm: 100,
    printableTopOverrideMm: 36,
    printableBottomOverrideMm: 242,
  });

  assert.ok(live);

  const reloaded = createPersistedBodyReferencePipeline({
    outline: live?.outline,
    canonicalBodyProfile: live?.canonicalBodyProfile,
    canonicalDimensionCalibration: live?.canonicalDimensionCalibration,
    printableSurfaceResolution: live?.printableSurfaceResolution,
    bodyReferenceQA: live?.qa,
    bodyReferenceWarnings: live?.warnings,
    bodyReferenceContractVersion: BODY_REFERENCE_CONTRACT_VERSION + 1,
  });

  assert.equal(reloaded, null);
});

test("persisted BODY REFERENCE artifacts are rejected when sample radii drift from the saved transform", () => {
  const live = deriveBodyReferencePipeline({
    outline: buildStanleyOutline(),
    overallHeightMm: 273.8,
    bodyTopFromOverallMm: 28,
    bodyBottomFromOverallMm: 244,
    wrapDiameterMm: 99.82,
    baseDiameterMm: 78.7,
    handleArcDeg: 90,
    handleSide: "right",
  });

  assert.ok(live);

  const corruptedProfile = {
    ...live!.canonicalBodyProfile,
    samples: live!.canonicalBodyProfile.samples.map((sample, index) => (
      index === 0
        ? { ...sample, radiusMm: 4.1 }
        : sample
    )),
  };

  const reloaded = createPersistedBodyReferencePipeline({
    outline: live?.outline,
    canonicalBodyProfile: corruptedProfile,
    canonicalDimensionCalibration: live?.canonicalDimensionCalibration,
    printableSurfaceResolution: live?.printableSurfaceResolution,
    bodyReferenceQA: live?.qa,
    bodyReferenceWarnings: live?.warnings,
    bodyReferenceContractVersion: BODY_REFERENCE_CONTRACT_VERSION,
  });

  assert.equal(reloaded, null);
});
