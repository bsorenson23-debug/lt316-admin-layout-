import { getWrapFrontCenter } from "../utils/tumblerWrapLayout.ts";
import {
  buildContourSvgPath,
  normalizeMeasurementContour,
  resolveEditableBodyOutlineDirectContour,
  sortEditableOutlinePoints,
} from "./editableBodyOutline.ts";
import type {
  CanonicalBodyProfile,
  CanonicalBodyProfileSample,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
  CanonicalHandleProfile,
} from "../types/productTemplate.ts";
import type { AxialSurfaceBand, PrintableSurfaceContract } from "../types/printableSurface.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";

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
type ContourSegment = {
  leftX: number;
  rightX: number;
  width: number;
  centerX: number;
};

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

function getContourSegmentsAtY(contour: ContourPoint[], y: number): ContourSegment[] {
  const xs = getContourIntersectionsAtY(contour, y)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const segments: ContourSegment[] = [];
  for (let index = 0; index + 1 < xs.length; index += 2) {
    const leftX = xs[index]!;
    const rightX = xs[index + 1]!;
    const width = rightX - leftX;
    if (!(width > 0.1)) continue;
    segments.push({
      leftX,
      rightX,
      width,
      centerX: (leftX + rightX) / 2,
    });
  }
  return segments;
}

function selectCenteredContourSegment(
  segments: ContourSegment[],
  centerX: number,
): ContourSegment | null {
  if (segments.length === 0) return null;
  return segments.reduce((best, segment) => {
    const bestDistance = Math.abs(best.centerX - centerX);
    const segmentDistance = Math.abs(segment.centerX - centerX);
    if (segmentDistance < bestDistance - 0.25) return segment;
    if (bestDistance < segmentDistance - 0.25) return best;
    if (segment.width > best.width + 0.25) return segment;
    if (best.width > segment.width + 0.25) return best;
    return segment;
  });
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
  const tracedContour = outline.sourceContourMode === "body-only"
    ? resolveEditableBodyOutlineDirectContour(outline)
    : null;
  if (tracedContour) {
    const tracedHalfWidthMm = findHalfWidthPxAtRow(tracedContour, 0, yMm);
    if (tracedHalfWidthMm > 0) {
      return round2(tracedHalfWidthMm);
    }
  }
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

function findCenteredBodySegmentAtRow(
  contour: ContourPoint[],
  axisX: number,
  yPx: number,
): ContourSegment | null {
  const segments = getContourSegmentsAtY(contour, yPx);
  if (segments.length === 0) return null;
  return selectCenteredContourSegment(segments, axisX);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function measurementToleranceMm(radiusMm: number): number {
  return Math.max(2, Math.abs(radiusMm) * 0.08);
}

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function firstFinitePositive(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (finitePositive(value)) return value;
  }
  return null;
}

function resolveCanonicalSampleRadiusMm(args: {
  outlineRadiusMm: number;
  measuredRadiusMm: number | null;
}): number {
  const outlineRadiusMm = round2(Math.max(0, args.outlineRadiusMm));
  const measuredRadiusMm = args.measuredRadiusMm != null && Number.isFinite(args.measuredRadiusMm)
    ? round2(Math.max(0, args.measuredRadiusMm))
    : null;
  if (!(outlineRadiusMm > 0)) {
    return measuredRadiusMm ?? 0;
  }
  if (!(measuredRadiusMm != null && measuredRadiusMm > 0)) {
    return outlineRadiusMm;
  }

  const minRatio = 0.82;
  const maxRatio = 1.18;
  if (
    measuredRadiusMm < outlineRadiusMm * minRatio ||
    measuredRadiusMm > outlineRadiusMm * maxRatio
  ) {
    return outlineRadiusMm;
  }

  return round2((outlineRadiusMm * 0.78) + (measuredRadiusMm * 0.22));
}

export interface CanonicalBodyContractQA {
  pass: boolean;
  severity: "ready" | "review" | "action";
  shellAuthority: "outline-profile" | "dimensional-seed";
  scaleAuthority: "validated-midband-ratio" | "outline-ratio-fallback" | "none";
  acceptedRowCount: number;
  rejectedRowCount: number;
  fallbackMode: "none" | "outline-only" | "missing-measurement-contour";
  issues: string[];
}

export interface CanonicalBodyContractResult {
  canonicalBodyProfile: CanonicalBodyProfile;
  canonicalDimensionCalibration: CanonicalDimensionCalibration;
  qa: CanonicalBodyContractQA;
}

type CanonicalMeasurementRow = {
  index: number;
  sNorm: number;
  yMm: number;
  yPx: number;
  xLeft: number;
  radiusPx: number;
  outlineRadiusMm: number;
};

function dedupeIssues(issues: string[]): string[] {
  return [...new Set(issues.filter((issue) => issue.trim().length > 0))];
}

function buildOutlineOnlySamples(rows: CanonicalMeasurementRow[]): CanonicalBodyProfileSample[] {
  return rows.map((row) => ({
    sNorm: round4(row.sNorm),
    yMm: round2(row.yMm),
    yPx: round2(row.yPx),
    xLeft: round2(row.xLeft),
    radiusPx: round2(row.radiusPx),
    radiusMm: round2(row.outlineRadiusMm),
  }));
}

function deriveCanonicalSamples(args: {
  outline: EditableBodyOutline | null | undefined;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  bodyDiameterMm?: number;
  wrapDiameterMm?: number;
  baseDiameterMm?: number | null;
  handleArcDeg?: number;
  handleSide?: "left" | "right" | null;
  axialSurfaceBands?: AxialSurfaceBand[] | null;
  printableSurfaceContract?: PrintableSurfaceContract | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
}): CanonicalBodyContractResult | null {
  const outline = args.outline;
  if (!outline || outline.points.length < 2) return null;
  const bodyTopMm = round2(args.bodyTopFromOverallMm);
  const bodyBottomMm = round2(args.bodyBottomFromOverallMm);
  const bodyHeightMm = Math.max(1, bodyBottomMm - bodyTopMm);
  const normalizedMeasurementContour = normalizeMeasurementContour({
    outline,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
  });
  const sourceContour = normalizedMeasurementContour?.contour ?? [];
  const sourceBounds = normalizedMeasurementContour?.bounds ?? getContourBounds(sourceContour);
  const hasSourceContour = sourceContour.length >= 3 && sourceBounds != null;
  const useBodyOnlyTraceSampling = hasSourceContour && outline.sourceContourMode === "body-only";
  let axisX = hasSourceContour ? estimateAxisXFromContour(sourceContour) : 0;
  const axisYTop = hasSourceContour ? (sourceBounds?.minY ?? 0) : bodyTopMm;
  const axisYBottom = hasSourceContour ? (sourceBounds?.maxY ?? axisYTop + 1) : bodyBottomMm;
  const axisHeightPx = Math.max(1, axisYBottom - axisYTop);
  const symmetrySource: "left" | "right" =
    useBodyOnlyTraceSampling
      ? "left"
      : args.handleSide === "left"
      ? "right"
      : "left";
  const sampleCount = Math.max(96, Math.min(240, Math.round(bodyHeightMm * 1.1)));
  const rows: CanonicalMeasurementRow[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const sNorm = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const yMm = round2(bodyTopMm + (bodyHeightMm * sNorm));
    const yPx = axisYTop + (axisHeightPx * sNorm);
    const centeredSegment = useBodyOnlyTraceSampling
      ? findCenteredBodySegmentAtRow(sourceContour, axisX, yPx)
      : null;
    const radiusPx = centeredSegment
      ? round2(centeredSegment.width / 2)
      : (hasSourceContour
        ? round2(findAuthoritativeHalfWidthPxAtRow(sourceContour, axisX, yPx, symmetrySource))
        : 0);
    const outlineRadiusMm = round2(interpolateRadiusMm(outline, yMm));
    rows.push({
      index,
      sNorm,
      yMm,
      yPx,
      xLeft: centeredSegment ? round2(centeredSegment.leftX) : round2(axisX - radiusPx),
      radiusPx,
      outlineRadiusMm,
    });
  }

  if (useBodyOnlyTraceSampling) {
    const measuredCenters = rows
      .filter((row) => row.radiusPx > 0)
      .map((row) => row.xLeft + row.radiusPx);
    if (measuredCenters.length > 0) {
      axisX = round2(median(measuredCenters));
    }
  }

  const candidateRows = rows.filter((row) =>
    row.sNorm >= 0.12 &&
    row.sNorm <= 0.68 &&
    row.radiusPx > 0.1 &&
    row.outlineRadiusMm > 0.1 &&
    !(row.radiusPx < 15 && row.outlineRadiusMm > 12)
  );
  const ratioCandidates = candidateRows
    .map((row) => row.outlineRadiusMm / row.radiusPx)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
  const rawRatio = ratioCandidates.length > 0 ? median(ratioCandidates) : 0;
  const acceptedRatioRows = rawRatio > 0
    ? candidateRows.filter((row) => {
        const measuredRadiusMm = row.radiusPx * rawRatio;
        return Math.abs(measuredRadiusMm - row.outlineRadiusMm) <= measurementToleranceMm(row.outlineRadiusMm);
      })
    : [];
  const acceptedRatios = acceptedRatioRows
    .map((row) => row.outlineRadiusMm / Math.max(row.radiusPx, 0.0001))
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
  const acceptedRowTarget = Math.max(12, Math.round(sampleCount * 0.12));
  const hasValidatedRatio = acceptedRatios.length >= acceptedRowTarget;
  const diameterAuthorityMm = firstFinitePositive(args.wrapDiameterMm, args.bodyDiameterMm);
  const fitDebugDiameterUnits = firstFinitePositive(
    args.fitDebug?.measurementBandWidthPx,
    args.fitDebug?.referenceBandWidthPx,
    args.fitDebug?.referenceHalfWidthPx ? args.fitDebug.referenceHalfWidthPx * 2 : null,
  );
  const contourDiameterCandidates = (candidateRows.length > 0 ? candidateRows : rows)
    .map((row) => row.radiusPx * 2)
    .filter((value) => Number.isFinite(value) && value > 0.2);
  const contourDiameterUnits = contourDiameterCandidates.length > 0
    ? Math.max(...contourDiameterCandidates)
    : 0;
  const contourFrameDiameterUnits = firstFinitePositive(
    outline.contourFrame?.authoritativeForBodyCutoutQa === true
      ? outline.contourFrame.sourceDiameterUnits
      : null,
  );
  const contourFrameMmPerSourceUnit = firstFinitePositive(
    outline.contourFrame?.authoritativeForBodyCutoutQa === true
      ? outline.contourFrame.mmPerSourceUnit
      : null,
  );
  const sourceDiameterUnits = firstFinitePositive(
    contourFrameDiameterUnits,
    fitDebugDiameterUnits,
    contourDiameterUnits,
  );
  const diameterMmPerSourceUnitFromDiameter =
    hasSourceContour &&
    finitePositive(diameterAuthorityMm) &&
    finitePositive(sourceDiameterUnits)
      ? diameterAuthorityMm / sourceDiameterUnits
      : 0;
  const diameterMmPerSourceUnit =
    hasSourceContour &&
    finitePositive(diameterAuthorityMm) &&
    finitePositive(contourFrameMmPerSourceUnit)
      ? contourFrameMmPerSourceUnit
      : diameterMmPerSourceUnitFromDiameter;
  const sourceMmPerPx = diameterMmPerSourceUnit > 0
    ? diameterMmPerSourceUnit
    : (
        hasValidatedRatio
          ? median(acceptedRatios)
          : (ratioCandidates.length > 0 ? median(ratioCandidates) : 0)
      );
  const uniformScaleApplied = hasSourceContour && sourceMmPerPx > 0 && finitePositive(diameterAuthorityMm);
  const resolvedBodyTopMm = bodyTopMm;
  const resolvedBodyHeightMm = uniformScaleApplied
    ? round2(axisHeightPx * sourceMmPerPx)
    : bodyHeightMm;
  const resolvedBodyBottomMm = round2(resolvedBodyTopMm + resolvedBodyHeightMm);
  const acceptedRowIndexes = new Set(acceptedRatioRows.map((row) => row.index));
  const measurementIssues: string[] = [];
  if (!hasSourceContour) {
    measurementIssues.push("Measurement contour missing; falling back to outline-only shell calibration.");
  } else if (!hasValidatedRatio && !uniformScaleApplied) {
    measurementIssues.push("Measurement contour did not produce enough stable mid-band rows; falling back to outline-only shell calibration.");
  }

  let samples: CanonicalBodyProfileSample[] = rows.map((row) => {
    const measuredRadiusMm = row.radiusPx > 0 && sourceMmPerPx > 0
      ? round2(row.radiusPx * sourceMmPerPx)
      : null;
    const canBlendMeasured =
      uniformScaleApplied ||
      (
        hasValidatedRatio &&
        acceptedRowIndexes.has(row.index) &&
        !(row.radiusPx < 15 && (measuredRadiusMm ?? 0) > 12 && Math.abs((measuredRadiusMm ?? 0) - row.outlineRadiusMm) > 1)
      );
    const radiusMm = canBlendMeasured
      ? (
          uniformScaleApplied
            ? (measuredRadiusMm ?? row.outlineRadiusMm)
            : resolveCanonicalSampleRadiusMm({
                outlineRadiusMm: row.outlineRadiusMm,
                measuredRadiusMm,
              })
        )
      : row.outlineRadiusMm;
    const yMm = uniformScaleApplied
      ? round2(resolvedBodyTopMm + ((row.yPx - axisYTop) * sourceMmPerPx))
      : round2(row.yMm);
    return {
      sNorm: round4(row.sNorm),
      yMm,
      yPx: round2(row.yPx),
      xLeft: round2(row.xLeft),
      radiusPx: round2(row.radiusPx),
      radiusMm: round2(radiusMm),
    };
  });

  let frontVisibleWidthMm = round2(
    samples.reduce((max, sample) => Math.max(max, sample.radiusMm * 2), 0),
  );
  let fallbackMode: CanonicalBodyContractQA["fallbackMode"] =
    !hasSourceContour
      ? "missing-measurement-contour"
      : (hasValidatedRatio || uniformScaleApplied ? "none" : "outline-only");
  const invariantIssues: string[] = [];
  const monotonicYmm = samples.every((sample, index) => index === 0 || sample.yMm > (samples[index - 1]?.yMm ?? Number.NEGATIVE_INFINITY));
  const monotonicYpx = samples.every((sample, index) => index === 0 || sample.yPx > (samples[index - 1]?.yPx ?? Number.NEGATIVE_INFINITY));
  if (!monotonicYmm) invariantIssues.push("Canonical body sample rows are not strictly increasing in mm space.");
  if (!monotonicYpx) invariantIssues.push("Canonical body sample rows are not strictly increasing in source-contour space.");
  if (hasValidatedRatio && sourceMmPerPx > 0) {
    const violatingRow = samples.find((sample, index) =>
      acceptedRowIndexes.has(index) &&
      Math.abs((sample.radiusPx * sourceMmPerPx) - sample.radiusMm) > measurementToleranceMm(sample.radiusMm)
    );
    if (violatingRow) {
      invariantIssues.push("Accepted measurement rows drift outside the radius consistency tolerance.");
    }
  }
  if (args.bodyDiameterMm && args.bodyDiameterMm > 0 && Math.abs(frontVisibleWidthMm - args.bodyDiameterMm) > 0.75) {
    invariantIssues.push(`Front visible width differs from body diameter by ${round2(Math.abs(frontVisibleWidthMm - args.bodyDiameterMm))} mm.`);
  }

  if (invariantIssues.length > 0 && hasSourceContour && !uniformScaleApplied) {
    samples = buildOutlineOnlySamples(rows);
    frontVisibleWidthMm = round2(
      samples.reduce((max, sample) => Math.max(max, sample.radiusMm * 2), 0),
    );
    fallbackMode = "outline-only";
  }

  const leftPoints = samples.map((sample) => ({ x: -sample.radiusMm, y: sample.yMm }));
  const rightPoints = [...samples].reverse().map((sample) => ({ x: sample.radiusMm, y: sample.yMm }));
  const resolvedDirectContour = outline.sourceContourMode === "body-only"
    ? resolveEditableBodyOutlineDirectContour(outline)
    : null;
  const tracedSvgPath = !uniformScaleApplied && resolvedDirectContour && resolvedDirectContour.length >= 3
    ? buildContourSvgPath(resolvedDirectContour.map((point) => ({ x: point.x, y: point.y })))
    : null;
  const svgPath = tracedSvgPath ?? buildContourSvgPath([...leftPoints, ...rightPoints]) ?? "";
  const wrapWidthMm = round2(Math.PI * Math.max(args.wrapDiameterMm ?? args.bodyDiameterMm ?? frontVisibleWidthMm, 0));
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
  const sx = sourceMmPerPx > 0 ? round4(sourceMmPerPx) : 1;
  const sy = hasSourceContour && axisHeightPx !== 0
    ? round4(uniformScaleApplied ? sourceMmPerPx : bodyHeightMm / axisHeightPx)
    : 1;
  const tx = hasSourceContour ? round4(-axisX * sx) : 0;
  const ty = hasSourceContour ? round4(resolvedBodyTopMm - (axisYTop * sy)) : 0;
  const qaIssues = dedupeIssues([...measurementIssues, ...invariantIssues]);
  const shellAuthority: CanonicalBodyContractQA["shellAuthority"] =
    outline.sourceContour?.length || outline.directContour?.length
      ? "outline-profile"
      : "dimensional-seed";
  const scaleAuthority: CanonicalBodyContractQA["scaleAuthority"] =
    hasValidatedRatio || uniformScaleApplied
      ? "validated-midband-ratio"
      : (sourceMmPerPx > 0 ? "outline-ratio-fallback" : "none");
  const qaPass = invariantIssues.length === 0 || fallbackMode === "outline-only" || fallbackMode === "missing-measurement-contour";
  const qaSeverity: CanonicalBodyContractQA["severity"] =
    !qaPass
      ? "action"
      : (qaIssues.length > 0 ? "review" : "ready");
  const canonicalBodyProfile: CanonicalBodyProfile = {
    symmetrySource,
    mirroredFromSymmetrySource: !useBodyOnlyTraceSampling,
    mirroredRightFromLeft: useBodyOnlyTraceSampling ? undefined : symmetrySource === "left",
    axis: {
      xTop: round2(axisX),
      yTop: round2(axisYTop),
      xBottom: round2(axisX),
      yBottom: round2(axisYBottom),
    },
    samples,
    svgPath,
  };
  const canonicalDimensionCalibration: CanonicalDimensionCalibration = {
    units: "mm",
    totalHeightMm: round2(args.overallHeightMm),
    bodyHeightMm: resolvedBodyHeightMm,
    lidBodyLineMm: round2(args.bodyTopFromOverallMm),
    bodyBottomMm: resolvedBodyBottomMm,
    wrapDiameterMm: round2(Math.max(args.wrapDiameterMm ?? args.bodyDiameterMm ?? frontVisibleWidthMm, 0)),
    baseDiameterMm: round2(Math.max(0, args.baseDiameterMm ?? 0)),
    wrapWidthMm,
    frontVisibleWidthMm,
    frontAxisPx: canonicalBodyProfile.axis,
    photoToFrontTransform: {
      type: uniformScaleApplied ? "similarity" : "affine",
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
  return {
    canonicalBodyProfile,
    canonicalDimensionCalibration,
    qa: {
      pass: qaPass,
      severity: qaSeverity,
      shellAuthority,
      scaleAuthority,
      acceptedRowCount: acceptedRatioRows.length,
      rejectedRowCount: Math.max(0, candidateRows.length - acceptedRatioRows.length),
      fallbackMode,
      issues: qaIssues,
    },
  };
}

export function deriveCanonicalBodyContract(args: {
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
}): CanonicalBodyContractResult | null {
  return deriveCanonicalSamples({
    outline: args.outline,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    bodyDiameterMm: args.wrapDiameterMm,
    wrapDiameterMm: args.wrapDiameterMm,
    baseDiameterMm: args.baseDiameterMm,
    handleArcDeg: args.handleArcDeg,
    handleSide: args.handleSide,
    axialSurfaceBands: args.axialSurfaceBands,
    printableSurfaceContract: args.printableSurfaceContract,
    fitDebug: args.fitDebug,
  });
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
  const contract = deriveCanonicalSamples({
    outline: args.outline,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    bodyDiameterMm: args.bodyDiameterMm,
    handleSide: args.handleSide,
    fitDebug: args.fitDebug,
  });
  return contract?.canonicalBodyProfile ?? null;
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
  const contract = deriveCanonicalBodyContract(args);
  return contract?.canonicalDimensionCalibration ?? null;
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
