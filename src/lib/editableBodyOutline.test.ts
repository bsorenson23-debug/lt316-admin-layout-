import assert from "node:assert/strict";
import test from "node:test";
import type { FlatItemLookupTraceDebug } from "../types/flatItemLookup.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import {
  createEditableBodyOutline,
  createEditableBodyOutlineFromImportedSvg,
  createEditableBodyOutlineFromTraceDebug,
  normalizeMeasurementContour,
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

test("trace-debug outline stores a deterministic body-only contour instead of the raw noisy silhouette", () => {
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
  // Keep the high-fidelity traced band for provenance, but use the simpler
  // mirrored contour for deterministic editing and downstream generation.
  assert.ok((outline.directContour?.length ?? 0) < (outline.sourceContour?.length ?? 0));
  assert.ok((outline.sourceContourBounds?.minY ?? 0) > 80);
  assert.ok((outline.sourceContourBounds?.maxY ?? 999) < 660);
  assert.ok(widthAtY(outline.sourceContour ?? [], 380) > 70);
  assert.ok(widthAtY(outline.directContour ?? [], 80) > 90);
  assert.ok(widthAtY(outline.directContour ?? [], 80) < 110);
  assert.ok(Math.abs((outline.directContour?.[0]?.y ?? 0) - 40) < 0.5);
  assert.ok(Math.abs((outline.directContour?.at(-1)?.y ?? 999) - 40) < 0.5);
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

test("body-only imported outline stays aligned with the auto body-band fit", () => {
  const source = {
    svgText: "",
    pathData: "",
    viewport: {
      minX: 0,
      minY: 0,
      width: 800,
      height: 800,
    },
    bounds: {
      minX: 228,
      minY: 158,
      maxX: 452,
      maxY: 777,
      width: 224,
      height: 619,
    },
    contour: [
      { x: 228, y: 158 },
      { x: 228, y: 552 },
      { x: 256, y: 619 },
      { x: 284, y: 777 },
      { x: 396, y: 777 },
      { x: 424, y: 619 },
      { x: 452, y: 552 },
      { x: 452, y: 158 },
      { x: 228, y: 158 },
    ],
  };

  const autoOutline = createEditableBodyOutlineFromImportedSvg({
    source,
    overallHeightMm: 254,
    bodyTopFromOverallMm: 26,
    bodyBottomFromOverallMm: 226,
    diameterMm: 106,
    topOuterDiameterMm: 106,
    side: "right",
  });
  const bodyOnlyOutline = createEditableBodyOutlineFromImportedSvg({
    source,
    overallHeightMm: 254,
    bodyTopFromOverallMm: 26,
    bodyBottomFromOverallMm: 226,
    diameterMm: 106,
    topOuterDiameterMm: 106,
    side: "right",
    sourceMode: "body-only",
  });

  const autoByRole = new Map(autoOutline.points.map((point) => [point.role, point]));
  const bodyOnlyByRole = new Map(bodyOnlyOutline.points.map((point) => [point.role, point]));

  assert.equal(bodyOnlyByRole.get("topOuter")?.x, autoByRole.get("topOuter")?.x);
  for (const role of ["upperTaper", "lowerTaper", "bevel", "base"] as const) {
    assert.ok(
      Math.abs((bodyOnlyByRole.get(role)?.x ?? 0) - (autoByRole.get(role)?.x ?? 0)) <= 0.3,
      `expected ${role} to stay within body-band fit tolerance, got auto=${autoByRole.get(role)?.x} bodyOnly=${bodyOnlyByRole.get(role)?.x}`,
    );
  }
});

test("body-only imported outline trims narrow top protrusions before scaling the shell", () => {
  const source = {
    svgText: "",
    pathData: "",
    viewport: {
      minX: 0,
      minY: 0,
      width: 800,
      height: 900,
    },
    bounds: {
      minX: 250,
      minY: 20,
      maxX: 470,
      maxY: 820,
      width: 220,
      height: 800,
    },
    contour: [
      { x: 350, y: 20 },
      { x: 350, y: 80 },
      { x: 250, y: 80 },
      { x: 250, y: 420 },
      { x: 280, y: 660 },
      { x: 300, y: 820 },
      { x: 420, y: 820 },
      { x: 440, y: 660 },
      { x: 470, y: 420 },
      { x: 470, y: 80 },
      { x: 370, y: 80 },
      { x: 370, y: 20 },
      { x: 350, y: 20 },
    ],
  };

  const outline = createEditableBodyOutlineFromImportedSvg({
    source,
    overallHeightMm: 254,
    bodyTopFromOverallMm: 26,
    bodyBottomFromOverallMm: 226,
    diameterMm: 106,
    topOuterDiameterMm: 106,
    side: "right",
    sourceMode: "body-only",
  });

  const byRole = new Map(outline.points.map((point) => [point.role, point]));

  assert.ok((outline.sourceContourBounds?.minY ?? 0) >= 70);
  assert.ok((outline.sourceContourBounds?.height ?? 0) < source.bounds.height);
  assert.ok(Math.abs((byRole.get("topOuter")?.x ?? 0) - 53) < 0.5);
  assert.ok(Math.abs((byRole.get("body")?.x ?? 0) - 53) < 1);
});

test("body-only measurement contour crops to the body band without re-mirroring it", () => {
  const tracedContour = [
    { x: 220, y: 100 },
    { x: 220, y: 360 },
    { x: 238, y: 700 },
    { x: 392, y: 700 },
    { x: 430, y: 360 },
    { x: 462, y: 100 },
    { x: 220, y: 100 },
  ];

  const normalized = normalizeMeasurementContour({
    outline: {
      closed: true,
      version: 1,
      points: [],
      sourceContour: tracedContour,
      sourceContourMode: "body-only",
    },
    overallHeightMm: 254,
    bodyTopFromOverallMm: 26,
    bodyBottomFromOverallMm: 226,
  });

  assert.ok(normalized);
  assert.equal(normalized?.mirrored, false);
  assert.equal(normalized?.bodyOnly, true);
  assert.ok((normalized?.contour.length ?? 0) > tracedContour.length);
  assert.ok((normalized?.bounds.minX ?? 0) >= 220);
  assert.ok((normalized?.bounds.maxX ?? 0) <= 462);
  assert.ok((normalized?.contour.some((point) => point.x > 400) ?? false));
});
