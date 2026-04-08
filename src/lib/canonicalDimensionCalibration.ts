import { getWrapFrontCenter } from "@/utils/tumblerWrapLayout";
import {
  buildContourSvgPath,
  sortEditableOutlinePoints,
} from "@/lib/editableBodyOutline";
import type {
  CanonicalBodyProfile,
  CanonicalBodyProfileSample,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
  CanonicalHandleProfile,
} from "@/types/productTemplate";
import type { AxialSurfaceBand, PrintableSurfaceContract } from "@/types/printableSurface";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapMm(value: number, wrapWidthMm: number): number {
  if (!(wrapWidthMm > 0)) return 0;
  const wrapped = value % wrapWidthMm;
  return wrapped < 0 ? wrapped + wrapWidthMm : wrapped;
}

type ContourPoint = { x: number; y: number };

function getContourBounds(points: ContourPoint[]) {
  if (points.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function getContourIntersectionsAtY(contour: ContourPoint[], y: number): number[] {
  if (contour.length < 2) return [];
  const xs: number[] = [];
  for (let index = 0; index < contour.length; index += 1) {
    const current = contour[index];
    const next = contour[(index + 1) % contour.length];
    if (!current || !next) continue;
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
  return xs.sort((a, b) => a - b);
}

function estimateAxisXFromContour(contour: ContourPoint[]): number {
  const bounds = getContourBounds(contour);
  if (!bounds) return 0;
  const centers: number[] = [];
  const sampleCount = Math.max(24, Math.min(120, Math.round(bounds.height)));
  const startY = bounds.minY + (bounds.height * 0.08);
  const endY = bounds.minY + (bounds.height * 0.92);
  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = startY + ((endY - startY) * t);
    const xs = getContourIntersectionsAtY(contour, y);
    if (xs.length < 2) continue;
    const left = xs[0]!;
    const right = xs[xs.length - 1]!;
    centers.push((left + right) / 2);
  }
  if (centers.length === 0) {
    return (bounds.minX + bounds.maxX) / 2;
  }
  const sorted = [...centers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? ((bounds.minX + bounds.maxX) / 2);
}

function interpolateRadiusMm(outline: EditableBodyOutline, yMm: number): number {
  const sorted = sortEditableOutlinePoints(outline.points);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return Math.max(0, sorted[0]?.x ?? 0);
  if (yMm <= (sorted[0]?.y ?? 0)) return Math.max(0, sorted[0]?.x ?? 0);
  if (yMm >= (sorted[sorted.length - 1]?.y ?? 0)) return Math.max(0, sorted[sorted.length - 1]?.x ?? 0);

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (!current || !next) continue;
    if (yMm < current.y || yMm > next.y) continue;
    const span = Math.max(0.0001, next.y - current.y);
    const t = clamp((yMm - current.y) / span, 0, 1);
    return Math.max(0, current.x + ((next.x - current.x) * t));
  }

  return Math.max(0, sorted[sorted.length - 1]?.x ?? 0);
}

function findHalfWidthPxAtRow(contour: ContourPoint[], axisX: number, yPx: number): number {
  const xs = getContourIntersectionsAtY(contour, yPx);
  if (xs.length < 2) {
    return 0;
  }
  const left = xs[0]!;
  const right = xs[xs.length - 1]!;
  return Math.max(0, Math.min(axisX - left, right - axisX));
}

function findAuthoritativeHalfWidthPxAtRow(
  contour: ContourPoint[],
  axisX: number,
  yPx: number,
  side: "left" | "right",
): number {
  const xs = getContourIntersectionsAtY(contour, yPx);
  if (xs.length < 2) return 0;
  const left = xs[0]!;
  const right = xs[xs.length - 1]!;
  return side === "left"
    ? Math.max(0, axisX - left)
    : Math.max(0, right - axisX);
}

export function buildCanonicalBodyProfile(args: {
  outline: EditableBodyOutline | null | undefined;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  bodyDiameterMm?: number;
  handleSide?: "left" | "right" | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
}): CanonicalBodyProfile | null {
  const outline = args.outline;
  if (!outline || outline.points.length < 2) return null;
  const bodyTopMm = round2(args.bodyTopFromOverallMm);
  const bodyBottomMm = round2(args.bodyBottomFromOverallMm);
  const bodyHeightMm = Math.max(1, bodyBottomMm - bodyTopMm);
  const sourceContour = outline.sourceContour ?? outline.directContour ?? [];
  const sourceBounds = getContourBounds(sourceContour);
  const axisX = sourceContour.length >= 3
    ? estimateAxisXFromContour(sourceContour)
    : (outline.sourceContourBounds ? (outline.sourceContourBounds.minX + outline.sourceContourBounds.maxX) / 2 : 0);
  const axisYTop = args.fitDebug?.bodyTopPx ?? sourceBounds?.minY ?? 0;
  const axisYBottom = args.fitDebug?.bodyBottomPx ?? sourceBounds?.maxY ?? axisYTop + 1;
  const axisHeightPx = Math.max(1, axisYBottom - axisYTop);
  const symmetrySource: "left" | "right" =
    args.handleSide === "left"
      ? "right"
      : "left";
  const sampleCount = Math.max(96, Math.min(240, Math.round(bodyHeightMm * 1.1)));
  const sourceRadiusSamplesPx: number[] = [];
  if (sourceContour.length >= 3) {
    for (let index = 0; index < sampleCount; index += 1) {
      const sNorm = sampleCount === 1 ? 0 : index / (sampleCount - 1);
      if (sNorm < 0.12 || sNorm > 0.46) continue;
      const yPx = axisYTop + (axisHeightPx * sNorm);
      const radiusPx = findAuthoritativeHalfWidthPxAtRow(sourceContour, axisX, yPx, symmetrySource);
      if (radiusPx > 0) sourceRadiusSamplesPx.push(radiusPx);
    }
  }
  sourceRadiusSamplesPx.sort((a, b) => a - b);
  const medianSourceRadiusPx = sourceRadiusSamplesPx.length > 0
    ? sourceRadiusSamplesPx[Math.floor(sourceRadiusSamplesPx.length / 2)] ?? 0
    : 0;
  const sourceMmPerPx = args.bodyDiameterMm && args.bodyDiameterMm > 0 && medianSourceRadiusPx > 0
    ? (args.bodyDiameterMm / 2) / medianSourceRadiusPx
    : 0;
  const samples: CanonicalBodyProfileSample[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const sNorm = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const yMm = round2(bodyTopMm + (bodyHeightMm * sNorm));
    const yPx = axisYTop + (axisHeightPx * sNorm);
    const radiusPx = sourceContour.length >= 3
      ? round2(findAuthoritativeHalfWidthPxAtRow(sourceContour, axisX, yPx, symmetrySource))
      : 0;
    const interpolatedRadiusMm = round2(interpolateRadiusMm(outline, yMm));
    const radiusMm = round2(
      radiusPx > 0 && sourceMmPerPx > 0
        ? radiusPx * sourceMmPerPx
        : interpolatedRadiusMm,
    );
    samples.push({
      sNorm: round4(sNorm),
      yMm,
      yPx: round2(yPx),
      xLeft: round2(axisX - radiusPx),
      radiusPx,
      radiusMm,
    });
  }

  const leftPoints = samples.map((sample) => ({ x: -sample.radiusMm, y: sample.yMm }));
  const rightPoints = [...samples].reverse().map((sample) => ({ x: sample.radiusMm, y: sample.yMm }));
  const svgPath = buildContourSvgPath([...leftPoints, ...rightPoints]) ?? "";

  return {
    symmetrySource,
    mirroredFromSymmetrySource: true,
    mirroredRightFromLeft: symmetrySource === "left",
    axis: {
      xTop: round2(axisX),
      yTop: round2(axisYTop),
      xBottom: round2(axisX),
      yBottom: round2(axisYBottom),
    },
    samples,
    svgPath,
  };
}

export function buildCanonicalDimensionCalibration(args: {
  outline: EditableBodyOutline | null | undefined;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  wrapDiameterMm: number;
  baseDiameterMm?: number | null;
  handleArcDeg?: number;
  handleSide?: "left" | "right" | null;
  axialSurfaceBands?: AxialSurfaceBand[] | null;
  printableSurfaceContract?: PrintableSurfaceContract | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
}): CanonicalDimensionCalibration | null {
  const canonicalBodyProfile = buildCanonicalBodyProfile({
    outline: args.outline,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    bodyDiameterMm: args.wrapDiameterMm,
    handleSide: args.handleSide,
    fitDebug: args.fitDebug,
  });
  if (!canonicalBodyProfile || canonicalBodyProfile.samples.length < 2) {
    return null;
  }

  const bodyHeightMm = round2(Math.max(0, args.bodyBottomFromOverallMm - args.bodyTopFromOverallMm));
  const frontVisibleWidthMm = round2(
    canonicalBodyProfile.samples.reduce((max, sample) => Math.max(max, sample.radiusMm * 2), 0),
  );
  const wrapWidthMm = round2(Math.PI * Math.max(args.wrapDiameterMm, 0));
  const frontMeridianMm = round2(getWrapFrontCenter(wrapWidthMm, args.handleArcDeg));
  const backMeridianMm = round2((frontMeridianMm + (wrapWidthMm / 2)) % Math.max(wrapWidthMm, 1));
  const leftQuarterMm = round2((frontMeridianMm + (wrapWidthMm * 0.75)) % Math.max(wrapWidthMm, 1));
  const rightQuarterMm = round2((frontMeridianMm + (wrapWidthMm * 0.25)) % Math.max(wrapWidthMm, 1));
  const handleMeridianMm = args.handleArcDeg && args.handleArcDeg > 0
    ? round2((frontMeridianMm + (wrapWidthMm / 2)) % Math.max(wrapWidthMm, 1))
    : undefined;
  const handleKeepOutWidthMm = args.handleArcDeg && args.handleArcDeg > 0
    ? round2(wrapWidthMm * (args.handleArcDeg / 360))
    : undefined;
  const handleKeepOutStartMm = handleMeridianMm != null && handleKeepOutWidthMm != null
    ? round2(wrapMm(handleMeridianMm - (handleKeepOutWidthMm / 2), Math.max(wrapWidthMm, 1)))
    : undefined;
  const handleKeepOutEndMm = handleMeridianMm != null && handleKeepOutWidthMm != null
    ? round2(wrapMm(handleMeridianMm + (handleKeepOutWidthMm / 2), Math.max(wrapWidthMm, 1)))
    : undefined;

  const axis = canonicalBodyProfile.axis;
  const sourceContour = args.outline?.sourceContour ?? args.outline?.directContour ?? [];
  const sourceHalfWidthPx = sourceContour.length >= 3
    ? round2(
        sourceContour.reduce((max, point) => Math.max(max, Math.abs(point.x - axis.xTop)), 0),
      )
    : round2(frontVisibleWidthMm / 2);
  const sx = sourceHalfWidthPx > 0 ? round4((frontVisibleWidthMm / 2) / sourceHalfWidthPx) : 1;
  const sy = (axis.yBottom - axis.yTop) !== 0 ? round4(bodyHeightMm / (axis.yBottom - axis.yTop)) : 1;
  const tx = round4(-axis.xTop * sx);
  const ty = round4(args.bodyTopFromOverallMm - (axis.yTop * sy));

  return {
    units: "mm",
    totalHeightMm: round2(args.overallHeightMm),
    bodyHeightMm,
    lidBodyLineMm: round2(args.bodyTopFromOverallMm),
    bodyBottomMm: round2(args.bodyBottomFromOverallMm),
    wrapDiameterMm: round2(args.wrapDiameterMm),
    baseDiameterMm: round2(Math.max(0, args.baseDiameterMm ?? 0)),
    wrapWidthMm,
    frontVisibleWidthMm,
    frontAxisPx: axis,
    photoToFrontTransform: {
      type: "affine",
      matrix: [sx, 0, tx, 0, sy, ty],
    },
    svgFrontViewBoxMm: {
      x: round2(-frontVisibleWidthMm / 2),
      y: 0,
      width: frontVisibleWidthMm,
      height: round2(args.overallHeightMm),
    },
    wrapMappingMm: {
      frontMeridianMm,
      backMeridianMm,
      leftQuarterMm,
      rightQuarterMm,
      handleMeridianMm,
      handleKeepOutArcDeg: args.handleArcDeg && args.handleArcDeg > 0 ? round2(args.handleArcDeg) : undefined,
      handleKeepOutWidthMm,
      handleKeepOutStartMm,
      handleKeepOutEndMm,
    },
    axialSurfaceBands: args.axialSurfaceBands ?? undefined,
    printableSurfaceContract: args.printableSurfaceContract ?? undefined,
    glbScale: {
      unitsPerMm: 1,
    },
  };
}

export interface CanonicalSilhouetteMismatchSummary {
  rowCount: number;
  averageErrorMm: number;
  maxErrorMm: number;
}

export interface CanonicalOrientationQASummary {
  bodyTopWorldY: number;
  bodyBottomWorldY: number;
  topSampleWorldY: number;
  bottomSampleWorldY: number;
  printableTopWorldY: number | null;
  printableBottomWorldY: number | null;
  bodyUpright: boolean;
  sampleOrderUpright: boolean;
  printableBandUpright: boolean | null;
  pass: boolean;
}

export interface CanonicalHandleDebugSummary {
  side: CanonicalHandleProfile["side"];
  confidence: number;
  extrusionDepthMm: number;
  derivedFromCanonicalProfile: boolean;
}

export type CanonicalHandleRenderMode = "extracted" | "simplified" | "hidden";

function hasUsableCanonicalHandleGeometry(handleProfile: CanonicalHandleProfile | null | undefined): boolean {
  if (!handleProfile) return false;
  const upper = handleProfile.anchors.upper;
  const lower = handleProfile.anchors.lower;
  const anchorsValid =
    Number.isFinite(upper.xPx) &&
    Number.isFinite(upper.yPx) &&
    Number.isFinite(lower.xPx) &&
    Number.isFinite(lower.yPx) &&
    Math.abs((lower.yPx ?? 0) - (upper.yPx ?? 0)) >= 8;
  const usableWidthSamples = handleProfile.widthProfile.filter(
    (sample) => Number.isFinite(sample.widthPx) && sample.widthPx > 0,
  ).length;
  const hasUsableContours =
    handleProfile.centerline.length >= 3 ||
    handleProfile.outerContour.length >= 4 ||
    handleProfile.innerContour.length >= 4;
  const hasUsableDepth =
    (Number.isFinite(handleProfile.symmetricExtrusionWidthPx) && (handleProfile.symmetricExtrusionWidthPx ?? 0) > 0) ||
    usableWidthSamples >= 6;
  return anchorsValid && hasUsableContours && hasUsableDepth;
}

export function resolveCanonicalHandleRenderMode(args: {
  handleProfile: CanonicalHandleProfile | null | undefined;
  previewMode: "alignment-model" | "full-model";
}): CanonicalHandleRenderMode {
  if (args.previewMode === "alignment-model") {
    return "hidden";
  }
  const confidence = args.handleProfile?.confidence ?? 0;
  if (confidence < 0.6) {
    return hasUsableCanonicalHandleGeometry(args.handleProfile) ? "simplified" : "hidden";
  }
  return confidence >= 0.8 ? "extracted" : "simplified";
}

export function summarizeCanonicalHandleDebug(args: {
  handleProfile: CanonicalHandleProfile | null | undefined;
  calibration: CanonicalDimensionCalibration | null | undefined;
}): CanonicalHandleDebugSummary | null {
  const handleProfile = args.handleProfile;
  const calibration = args.calibration;
  if (!handleProfile || !calibration || handleProfile.widthProfile.length === 0) {
    return null;
  }

  const sx = calibration.photoToFrontTransform.matrix[0] ?? 1;
  const robustWidths = handleProfile.widthProfile
    .map((sample) => Math.max(1.2, Math.abs(sample.widthPx * sx)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (robustWidths.length === 0) return null;
  const profileExtrusionDepthMm = robustWidths[Math.floor(robustWidths.length / 2)] ?? 0;
  const extrusionDepthMm = handleProfile.symmetricExtrusionWidthPx && Number.isFinite(handleProfile.symmetricExtrusionWidthPx)
    ? Math.max(1.2, Math.abs(handleProfile.symmetricExtrusionWidthPx * sx))
    : profileExtrusionDepthMm;

  return {
    side: handleProfile.side,
    confidence: round4(handleProfile.confidence),
    extrusionDepthMm: round4(extrusionDepthMm),
    derivedFromCanonicalProfile: handleProfile.outerContour.length >= 3 && handleProfile.innerContour.length >= 3,
  };
}

export function summarizeCanonicalSilhouetteMismatch(args: {
  outline: EditableBodyOutline | null | undefined;
  bodyProfile: CanonicalBodyProfile | null | undefined;
  calibration: CanonicalDimensionCalibration | null | undefined;
}): CanonicalSilhouetteMismatchSummary | null {
  const contour = args.outline?.sourceContour ?? args.outline?.directContour ?? [];
  const bodyProfile = args.bodyProfile;
  const calibration = args.calibration;
  if (!bodyProfile || !calibration || contour.length < 3 || bodyProfile.samples.length === 0) {
    return null;
  }

  const sx = calibration.photoToFrontTransform.matrix[0] ?? 1;
  if (!Number.isFinite(sx) || Math.abs(sx) < 0.0001) return null;

  let total = 0;
  let max = 0;
  let count = 0;
  for (const sample of bodyProfile.samples) {
    const halfWidthPx = findHalfWidthPxAtRow(contour, bodyProfile.axis.xTop, sample.yPx);
    if (!Number.isFinite(halfWidthPx) || halfWidthPx <= 0) continue;
    const halfWidthMm = halfWidthPx * sx;
    const errorMm = Math.abs(halfWidthMm - sample.radiusMm);
    total += errorMm;
    if (errorMm > max) max = errorMm;
    count += 1;
  }

  if (count === 0) return null;
  return {
    rowCount: count,
    averageErrorMm: round4(total / count),
    maxErrorMm: round4(max),
  };
}

function frontYToViewerWorldY(
  yMm: number,
  viewBoxMm: CanonicalDimensionCalibration["svgFrontViewBoxMm"],
): number {
  return round4((viewBoxMm.y + (viewBoxMm.height / 2)) - yMm);
}

export function summarizeCanonicalOrientationQA(args: {
  bodyProfile: CanonicalBodyProfile | null | undefined;
  calibration: CanonicalDimensionCalibration | null | undefined;
}): CanonicalOrientationQASummary | null {
  const bodyProfile = args.bodyProfile;
  const calibration = args.calibration;
  if (!bodyProfile || !calibration || bodyProfile.samples.length < 2) {
    return null;
  }

  const viewBoxMm = calibration.svgFrontViewBoxMm;
  const topSample = bodyProfile.samples.reduce(
    (best, sample) => (sample.yMm < best.yMm ? sample : best),
    bodyProfile.samples[0]!,
  );
  const bottomSample = bodyProfile.samples.reduce(
    (best, sample) => (sample.yMm > best.yMm ? sample : best),
    bodyProfile.samples[0]!,
  );
  const bodyTopWorldY = frontYToViewerWorldY(calibration.lidBodyLineMm, viewBoxMm);
  const bodyBottomWorldY = frontYToViewerWorldY(calibration.bodyBottomMm, viewBoxMm);
  const topSampleWorldY = frontYToViewerWorldY(topSample.yMm, viewBoxMm);
  const bottomSampleWorldY = frontYToViewerWorldY(bottomSample.yMm, viewBoxMm);
  const printableTopMm = calibration.printableSurfaceContract?.printableTopMm;
  const printableBottomMm = calibration.printableSurfaceContract?.printableBottomMm;
  const printableTopWorldY = Number.isFinite(printableTopMm)
    ? frontYToViewerWorldY(printableTopMm ?? 0, viewBoxMm)
    : null;
  const printableBottomWorldY = Number.isFinite(printableBottomMm)
    ? frontYToViewerWorldY(printableBottomMm ?? 0, viewBoxMm)
    : null;

  const bodyUpright = bodyTopWorldY > bodyBottomWorldY;
  const sampleOrderUpright = topSampleWorldY > bottomSampleWorldY;
  const printableBandUpright =
    printableTopWorldY != null && printableBottomWorldY != null
      ? printableTopWorldY > printableBottomWorldY
      : null;

  return {
    bodyTopWorldY,
    bodyBottomWorldY,
    topSampleWorldY,
    bottomSampleWorldY,
    printableTopWorldY,
    printableBottomWorldY,
    bodyUpright,
    sampleOrderUpright,
    printableBandUpright,
    pass: bodyUpright && sampleOrderUpright && (printableBandUpright ?? true),
  };
}
