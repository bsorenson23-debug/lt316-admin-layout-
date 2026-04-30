import assert from "node:assert/strict";
import test from "node:test";
import type { FlatItemLookupTraceDebug } from "../types/flatItemLookup.ts";
import type { EditableBodyOutline } from "../types/productTemplate.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import {
  createEditableBodyOutline,
  createEditableBodyOutlineFromImportedSvg,
  createEditableBodyOutlineFromTraceDebug,
  normalizeMeasurementContour,
  resolveAuthoritativeEditableBodyOutlineContour,
} from "./editableBodyOutline.ts";
import { buildBodyReferenceSvgQualityReportFromOutline } from "./bodyReferenceSvgQuality.ts";

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

test("fit-debug fallback outline preserves full body-only source frame and diameter seed", () => {
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
  assert.ok((outline.contourFrame?.acceptedPreviewBounds?.width ?? 0) >= 99);
  assert.ok((outline.sourceContour?.length ?? 0) >= noisyStanleyFitDebug.profilePoints.length * 2);
  assert.equal(outline.contourFrame?.kind, "full-body-only-source");
  assert.equal(outline.contourFrame?.bandCropApplied, false);
  assert.equal(outline.contourFrame?.bodyOnlyReCropSkipped, true);
  assert.ok((outline.contourFrame?.acceptedPreviewBounds?.height ?? 0) > 216);
});

test("fit-debug body contour top bridge aligns to seam body-top guide without restoring the rim band", () => {
  const fitDebug: TumblerItemLookupFitDebug = {
    kind: "lathe-body-fit",
    sourceImageUrl: "https://example.com/iceflow-body.png",
    imageWidthPx: 600,
    imageHeightPx: 700,
    silhouetteBoundsPx: { minX: 120, minY: 40, maxX: 480, maxY: 660 },
    centerXPx: 300,
    fullTopPx: 40,
    fullBottomPx: 660,
    bodyTopPx: 220,
    bodyBottomPx: 635,
    rimTopPx: 180,
    rimBottomPx: 201,
    referenceBandTopPx: 224,
    referenceBandBottomPx: 238,
    referenceBandCenterYPx: 231,
    referenceBandWidthPx: 169,
    maxCenterWidthPx: 191,
    referenceHalfWidthPx: 84.5,
    fitScore: 8.9,
    profilePoints: Array.from({ length: 43 }, (_, index) => {
      const yPx = Math.min(635, 220 + (index * 10));
      return {
        yPx,
        yMm: 25 + ((yPx - 220) * (88.9 / 169)),
        radiusPx: 84.5,
        radiusMm: 44.45,
      };
    }),
  };

  const outline = createEditableBodyOutline({
    overallHeightMm: 218.4,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 175,
    diameterMm: 88.9,
    topOuterDiameterMm: 88.9,
    fitDebug,
  });
  const contour = resolveAuthoritativeEditableBodyOutlineContour(outline);
  const bounds = boundsOf(contour);
  const quality = buildBodyReferenceSvgQualityReportFromOutline({ outline });
  const mmPerSourceUnit = 88.9 / 169;
  const expectedBodyTopGuideY = Math.round((25 + ((fitDebug.rimBottomPx - 220) * mmPerSourceUnit)) * 10) / 10;
  const mappedRimTopY = Math.round((expectedBodyTopGuideY + ((fitDebug.rimTopPx - fitDebug.rimBottomPx) * mmPerSourceUnit)) * 10) / 10;

  assert.ok(contour);
  assert.ok(bounds);
  assert.equal(bounds?.minY, expectedBodyTopGuideY);
  assert.equal(outline.sourceContourBounds?.minY, fitDebug.rimBottomPx);
  assert.equal(outline.contourFrame?.acceptedPreviewBounds?.minY, expectedBodyTopGuideY);
  assert.ok((bounds?.maxY ?? 0) > 243 && (bounds?.maxY ?? 0) < 244);
  assert.ok((bounds?.height ?? 0) > 225);
  assert.ok((bounds?.minY ?? 0) > mappedRimTopY, "rim/top-band pixels above the green guide remain excluded");
  assert.equal(quality.status, "pass");
  assert.equal(quality.expectedBridgeSegmentCount, 2);
  assert.equal(quality.suspiciousJumpCount, 0);
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

function rightXAtY(points: Array<{ x: number; y: number }>, y: number): number | null {
  const xs = xValuesAtY(points, y);
  return xs.length > 0 ? xs[xs.length - 1]! : null;
}

function leftXAtY(points: Array<{ x: number; y: number }>, y: number): number | null {
  const xs = xValuesAtY(points, y);
  return xs.length > 0 ? xs[0]! : null;
}

function xValuesAtY(points: Array<{ x: number; y: number }>, y: number): number[] {
  const xs: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    if (Math.abs(current.y - y) < 0.0001) {
      xs.push(current.x);
    }
    if (Math.abs(next.y - current.y) < 0.0001) continue;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    if (y < minY || y > maxY) continue;
    const t = (y - current.y) / (next.y - current.y);
    if (t < 0 || t > 1) continue;
    xs.push(round1(current.x + ((next.x - current.x) * t)));
  }
  return [...new Set(xs)].sort((a, b) => a - b);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function makeAngularManualBodyOnlyOutline(): EditableBodyOutline {
  return {
    closed: true,
    version: 1,
    sourceContourMode: "body-only",
    points: [
      { id: "top", x: 50, y: 20, role: "topOuter", pointType: "corner", inHandle: null, outHandle: null },
      { id: "body", x: 50, y: 80, role: "body", pointType: "smooth", inHandle: null, outHandle: null },
      { id: "shoulder", x: 50, y: 120, role: "shoulder", pointType: "smooth", inHandle: null, outHandle: null },
      { id: "upper-taper", x: 45, y: 160, role: "upperTaper", pointType: "corner", inHandle: null, outHandle: null },
      { id: "lower-taper", x: 41, y: 190, role: "lowerTaper", pointType: "corner", inHandle: null, outHandle: null },
      { id: "bevel", x: 37, y: 210, role: "bevel", pointType: "corner", inHandle: null, outHandle: null },
      { id: "base", x: 39, y: 220, role: "base", pointType: "corner", inHandle: null, outHandle: null },
    ],
    directContour: [
      { x: 50, y: 20 },
      { x: 39, y: 220 },
      { x: -39, y: 220 },
      { x: -50, y: 20 },
    ],
  };
}

function boundsOf(points: Array<{ x: number; y: number }> | null | undefined) {
  if (!points || points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
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

test("trace-debug outline preserves the accepted body-only contour and stores printable band separately", () => {
  const outline = createEditableBodyOutlineFromTraceDebug({
    traceDebug: noisyTraceDebug,
    overallHeightMm: 300,
    bodyTopFromOverallMm: 40,
    bodyBottomFromOverallMm: 260,
    diameterMm: 100,
    topOuterDiameterMm: 100,
  });

  const byRole = new Map(outline.points.map((point) => [point.role, point]));
  const directBounds = boundsOf(outline.directContour);
  assert.ok((outline.sourceContour?.length ?? 0) >= 10);
  assert.equal(outline.contourFrame?.kind, "full-body-only-source");
  assert.equal(outline.contourFrame?.authoritativeForBodyCutoutQa, true);
  assert.equal(outline.contourFrame?.authoritativeForPrintableBand, false);
  assert.equal(outline.contourFrame?.bandCropApplied, false);
  assert.equal(outline.contourFrame?.bodyOnlyReCropSkipped, true);
  assert.ok((outline.sourceContourBounds?.minY ?? 0) > 80);
  assert.ok((outline.sourceContourBounds?.maxY ?? 0) >= 700);
  assert.ok((outline.printableBandContourBounds?.height ?? 0) > 0);
  assert.ok((outline.printableBandContourBounds?.height ?? 9999) < (outline.contourFrame?.boundsBeforeBandCrop?.height ?? 0));
  assert.ok(widthAtY(outline.sourceContour ?? [], 300) > 70);
  assert.ok((directBounds?.height ?? 0) > 400);
  assert.ok((directBounds?.width ?? 0) >= 99);
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

test("manual body-only overrides rebuild authoritative contours from saved points", () => {
  const outline = {
    closed: true,
    version: 1 as const,
    sourceContourMode: "body-only" as const,
    points: [
      { id: "top", x: 54, y: 31.1, role: "topOuter" as const, pointType: "corner" as const, inHandle: null, outHandle: null },
      { id: "body", x: 54, y: 100, role: "body" as const, pointType: "smooth" as const, inHandle: null, outHandle: null },
      { id: "base", x: 38.1, y: 172.7, role: "base" as const, pointType: "corner" as const, inHandle: null, outHandle: null },
    ],
    directContour: [
      { x: 43.2, y: 31.1 },
      { x: 43.2, y: 100 },
      { x: 38.1, y: 172.7 },
      { x: -38.1, y: 172.7 },
      { x: -43.2, y: 100 },
      { x: -43.2, y: 31.1 },
    ],
  };

  const authoritativeContour = resolveAuthoritativeEditableBodyOutlineContour(outline);

  assert.ok((authoritativeContour?.length ?? 0) > 6);
  assert.equal(authoritativeContour?.[0]?.x, 54);
  assert.equal(authoritativeContour?.at(-1)?.x, -54);
});

test("manual body-only outline keeps a flat lower baseline instead of a bowl", () => {
  const outline = makeAngularManualBodyOnlyOutline();
  const contour = resolveAuthoritativeEditableBodyOutlineContour(outline);
  const bounds = boundsOf(contour);
  const bottomPoints = contour?.filter((point) => Math.abs(point.y - (bounds?.maxY ?? 0)) < 0.001) ?? [];

  assert.ok(contour);
  assert.ok(bounds);
  assert.equal(bounds?.maxY, 220);
  assert.ok(bottomPoints.some((point) => point.x === 39));
  assert.ok(bottomPoints.some((point) => point.x === -39));
  assert.ok(bottomPoints.every((point) => Math.abs(point.y - 220) < 0.001));
  assert.ok(widthAtY(contour ?? [], 220) >= 78);
});

test("manual body-only outline keeps angled shoulder and lower transition segments", () => {
  const contour = resolveAuthoritativeEditableBodyOutlineContour(makeAngularManualBodyOnlyOutline());

  assert.ok(contour);
  assert.equal(rightXAtY(contour, 130), 48.8);
  assert.equal(rightXAtY(contour, 195), 40);
  assert.equal(rightXAtY(contour, 215), 38);
});

test("manual body-only outline mirrors right-side contour edits symmetrically", () => {
  const contour = resolveAuthoritativeEditableBodyOutlineContour(makeAngularManualBodyOnlyOutline());

  assert.ok(contour);
  for (const y of [130, 195, 215, 220]) {
    const left = leftXAtY(contour, y);
    const right = rightXAtY(contour, y);
    assert.ok(left != null);
    assert.ok(right != null);
    assert.equal(Math.abs(left), right);
  }
});

test("body-only imported outline preserves full source frame instead of masquerading as body-band fit", () => {
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
  const bodyOnlyBounds = boundsOf(resolveAuthoritativeEditableBodyOutlineContour(bodyOnlyOutline));
  const autoBounds = boundsOf(resolveAuthoritativeEditableBodyOutlineContour(autoOutline));

  assert.equal(bodyOnlyByRole.get("topOuter")?.x, autoByRole.get("topOuter")?.x);
  assert.equal(bodyOnlyOutline.contourFrame?.kind, "full-body-only-source");
  assert.equal(bodyOnlyOutline.contourFrame?.bandCropApplied, false);
  assert.equal(bodyOnlyOutline.contourFrame?.bodyOnlyReCropSkipped, true);
  assert.ok((bodyOnlyOutline.printableBandContourBounds?.height ?? 0) > 0);
  assert.ok((bodyOnlyBounds?.height ?? 0) > (autoBounds?.height ?? 0));
  assert.ok((bodyOnlyByRole.get("base")?.y ?? 0) > (autoByRole.get("base")?.y ?? 0));
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

test("body-only measurement contour preserves accepted body shell without body-band re-crop", () => {
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
  assert.equal(normalized?.bodyOnlyReCropSkipped, true);
  assert.equal(normalized?.bandCropApplied, false);
  assert.equal(normalized?.contour.length, tracedContour.length);
  assert.equal(normalized?.bounds.minY, 100);
  assert.equal(normalized?.bounds.maxY, 700);
  assert.ok((normalized?.bounds.minX ?? 0) >= 220);
  assert.ok((normalized?.bounds.maxX ?? 0) <= 462);
  assert.ok((normalized?.contour.some((point) => point.x > 400) ?? false));
});

test("body-only approved contour preview does not collapse to printable 89 by 150 band", () => {
  const fullBodyContour = [
    { x: 215, y: 172 },
    { x: 215, y: 260 },
    { x: 220, y: 430 },
    { x: 230, y: 587 },
    { x: 369, y: 587 },
    { x: 379, y: 430 },
    { x: 384, y: 260 },
    { x: 384, y: 172 },
    { x: 215, y: 172 },
  ];
  const outline = createEditableBodyOutlineFromImportedSvg({
    source: {
      svgText: "",
      pathData: "",
      viewport: { minX: 0, minY: 0, width: 640, height: 760 },
      bounds: { minX: 215, minY: 172, maxX: 384, maxY: 587, width: 169, height: 415 },
      contour: fullBodyContour,
    },
    overallHeightMm: 218.4,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 175,
    diameterMm: 88.9,
    topOuterDiameterMm: 88.9,
    sourceMode: "body-only",
  });
  const previewBounds = boundsOf(resolveAuthoritativeEditableBodyOutlineContour(outline));
  const normalized = normalizeMeasurementContour({
    outline,
    overallHeightMm: 218.4,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 175,
  });

  assert.equal(outline.sourceContourMode, "body-only");
  assert.equal(outline.contourFrame?.kind, "full-body-only-source");
  assert.equal(outline.contourFrame?.authoritativeForBodyCutoutQa, true);
  assert.equal(outline.contourFrame?.authoritativeForPrintableBand, false);
  assert.equal(outline.contourFrame?.bandCropApplied, false);
  assert.equal(outline.contourFrame?.bodyOnlyReCropSkipped, true);
  assert.ok((previewBounds?.height ?? 0) > 150);
  assert.notEqual(Math.round(previewBounds?.height ?? 0), 150);
  assert.ok((outline.printableBandContourBounds?.height ?? 0) > 0);
  assert.ok((outline.printableBandContourBounds?.height ?? 9999) < (outline.contourFrame?.boundsBeforeBandCrop?.height ?? 0));
  assert.equal(normalized?.bodyOnlyReCropSkipped, true);
  assert.equal(normalized?.bandCropApplied, false);
});
