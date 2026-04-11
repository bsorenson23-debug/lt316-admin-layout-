import assert from "node:assert/strict";
import test from "node:test";
import type { FlatItemLookupTraceDebug } from "../types/flatItemLookup.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import {
  createEditableBodyOutline,
  createEditableBodyOutlineFromTraceDebug,
} from "./editableBodyOutline.ts";

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
  centerXPx: 310.73,
  fullTopPx: 0,
  fullBottomPx: 707,
  bodyTopPx: 16,
  bodyBottomPx: 707,
  rimTopPx: 16,
  rimBottomPx: 80,
  referenceBandTopPx: 60,
  referenceBandBottomPx: 92,
  referenceBandCenterYPx: 76,
  referenceBandWidthPx: 217,
  maxCenterWidthPx: 217,
  referenceHalfWidthPx: 108.5,
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
    { yPx: 16, yMm: 28, radiusPx: 8.73, radiusMm: 4.02 },
    { yPx: 139, yMm: 66.28, radiusPx: 105.96, radiusMm: 48.8 },
    { yPx: 246.33, yMm: 100, radiusPx: 108.48, radiusMm: 49.96 },
    { yPx: 523.32, yMm: 186.58, radiusPx: 84.69, radiusMm: 39.01 },
    { yPx: 707, yMm: 244, radiusPx: 18.73, radiusMm: 8.63 },
  ],
};

test("fit-debug fallback outline keeps Stanley shell seeded by dimensional truth", () => {
  const outline = createEditableBodyOutline({
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
    fitDebug: noisyStanleyFitDebug,
  });
  const byRole = new Map(outline.points.map((point) => [point.role, point]));

  assert.ok(Math.abs((byRole.get("topOuter")?.x ?? 0) - 49.91) < 1.0);
  assert.ok(Math.abs((byRole.get("body")?.x ?? 0) - 49.91) < 1.0);
  assert.ok(Math.abs((byRole.get("base")?.x ?? 0) - 39.35) < 1.25);
  assert.ok((outline.sourceContour?.length ?? 0) >= noisyStanleyFitDebug.profilePoints.length * 2);
});

function widthAtY(points: Array<{ x: number; y: number }>, y: number): number {
  if (points.length < 3) return 0;
  const xs: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    if (y < minY || y > maxY) continue;
    if (Math.abs(next.y - current.y) < 0.0001) {
      xs.push(current.x, next.x);
      continue;
    }
    const t = (y - current.y) / (next.y - current.y);
    if (t < 0 || t > 1) continue;
    xs.push(current.x + ((next.x - current.x) * t));
  }
  xs.sort((a, b) => a - b);
  if (xs.length < 2) return 0;
  return xs[xs.length - 1]! - xs[0]!;
}

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

test("trace-debug outline stores a body-only mirrored contour instead of the raw noisy silhouette", () => {
  const outline = createEditableBodyOutlineFromTraceDebug({
    traceDebug: noisyTraceDebug,
    overallHeightMm: 300,
    bodyTopFromOverallMm: 40,
    bodyBottomFromOverallMm: 260,
    diameterMm: 100,
    topOuterDiameterMm: 100,
  });

  const byRole = new Map(outline.points.map((point) => [point.role, point]));
  assert.ok((outline.sourceContour?.length ?? 0) >= 40);
  assert.ok((outline.sourceContourBounds?.minY ?? 0) > 80);
  assert.ok((outline.sourceContourBounds?.maxY ?? 999) < 660);
  assert.ok(widthAtY(outline.sourceContour ?? [], 380) > 70);
  assert.ok(
    Math.abs((byRole.get("topOuter")?.x ?? 0) - 50) < 1.0,
    `expected trace-derived top shell to stay seeded by diameter, got ${JSON.stringify(byRole.get("topOuter"))}`,
  );
});

test("trace-debug outline ignores implausibly tiny top-outer seeds", () => {
  const outline = createEditableBodyOutlineFromTraceDebug({
    traceDebug: noisyTraceDebug,
    overallHeightMm: 300,
    bodyTopFromOverallMm: 40,
    bodyBottomFromOverallMm: 260,
    diameterMm: 100,
    topOuterDiameterMm: 8.2,
  });

  const byRole = new Map(outline.points.map((point) => [point.role, point]));
  assert.ok(
    Math.abs((byRole.get("topOuter")?.x ?? 0) - 50) < 1.0,
    `expected trace-derived top shell to reject implausible topOuterDiameterMm, got ${JSON.stringify(byRole.get("topOuter"))}`,
  );
});
